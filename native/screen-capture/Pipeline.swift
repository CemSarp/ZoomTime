import Foundation
import CoreImage
import Metal
import VideoToolbox
import Darwin

struct CaptureFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
    init(_ message: String) { self.message = message }
}
func check(_ status: OSStatus, _ operation: String) throws {
    if status != noErr { throw CaptureFailure("\(operation): OSStatus \(status)") }
}

protocol Transport: AnyObject {
    func send(_ sample: CMSampleBuffer) throws
    func close() throws
}

final class LocalFileTransport: Transport {
    private let handle: FileHandle
    private var closed = false
    init(path: String) throws {
        let fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw CaptureFailure("Create output: errno \(errno)") }
        handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    }
    func send(_ sample: CMSampleBuffer) throws {
        guard !closed, let format = CMSampleBufferGetFormatDescription(sample), let block = CMSampleBufferGetDataBuffer(sample) else {
            throw CaptureFailure("Missing encoded H.264 sample")
        }
        var count = 0, headerLength: Int32 = 0
        try check(CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, parameterSetIndex: 0, parameterSetPointerOut: nil,
            parameterSetSizeOut: nil, parameterSetCountOut: &count, nalUnitHeaderLengthOut: &headerLength), "H.264 format")
        guard headerLength == 4 else { throw CaptureFailure("Unsupported H.264 NAL length") }
        let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[CFString: Any]]
        let keyframe = !(attachments?.first?[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
        var packet = Data()
        if keyframe {
            for index in 0..<count {
                var pointer: UnsafePointer<UInt8>?, size = 0
                try check(CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, parameterSetIndex: index, parameterSetPointerOut: &pointer,
                    parameterSetSizeOut: &size, parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil), "H.264 parameter set")
                packet.append(contentsOf: [0, 0, 0, 1]); packet.append(pointer!, count: size)
            }
        }
        let length = CMBlockBufferGetDataLength(block)
        var data = Data(count: length)
        try data.withUnsafeMutableBytes { bytes in
            try check(CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: bytes.baseAddress!), "H.264 bytes")
        }
        var offset = 0
        while offset < length {
            guard offset + 4 <= length else { throw CaptureFailure("Truncated NAL length") }
            let size = data[offset..<offset + 4].reduce(0) { ($0 << 8) | Int($1) }
            offset += 4
            guard size > 0, size <= length - offset else { throw CaptureFailure("Invalid NAL size") }
            packet.append(contentsOf: [0, 0, 0, 1]); packet.append(data[offset..<offset + size]); offset += size
        }
        try handle.write(contentsOf: packet)
    }
    func close() throws {
        if !closed { closed = true; try handle.synchronize(); try handle.close() }
    }
}

final class CompositeFrameRenderer {
    let context: CIContext
    let bounds: CGRect
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    private var pool: CVPixelBufferPool?
    init(width: Int, height: Int) throws {
        guard let device = MTLCreateSystemDefaultDevice() else { throw CaptureFailure("Metal unavailable") }
        context = CIContext(mtlDevice: device, options: [.cacheIntermediates: false, .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
        bounds = CGRect(x: 0, y: 0, width: width, height: height)
        try check(CVPixelBufferPoolCreate(nil, [kCVPixelBufferPoolMinimumBufferCountKey: 3] as CFDictionary,
            [kCVPixelBufferWidthKey: width, kCVPixelBufferHeightKey: height, kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA,
             kCVPixelBufferMetalCompatibilityKey: true, kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pool), "Pixel pool")
    }
    func render(_ layers: [CIImage?]) throws -> CVPixelBuffer {
        guard (1...4).contains(layers.count) else { throw CaptureFailure("Select one to four layers") }
        var buffer: CVPixelBuffer?
        try check(CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(nil, pool!, [kCVPixelBufferPoolAllocationThresholdKey: 6] as CFDictionary, &buffer), "Pixel buffer")
        var image = CIImage(color: .black).cropped(to: bounds)
        let columns = layers.count == 1 ? 1 : 2, rows = layers.count > 2 ? 2 : 1
        let w = bounds.width / CGFloat(columns), h = bounds.height / CGFloat(rows)
        for (index, layer) in layers.enumerated() {
            guard let layer, !layer.extent.isEmpty, !layer.extent.isInfinite else { continue }
            let scale = min(w / layer.extent.width, h / layer.extent.height)
            let x = CGFloat(index % columns) * w + (w - layer.extent.width * scale) / 2
            let y = bounds.height - CGFloat(index / columns + 1) * h + (h - layer.extent.height * scale) / 2
            let tile = layer.transformed(by: CGAffineTransform(translationX: -layer.extent.minX, y: -layer.extent.minY))
                .transformed(by: CGAffineTransform(scaleX: scale, y: scale)).transformed(by: CGAffineTransform(translationX: x, y: y))
            image = tile.composited(over: image)
        }
        CVBufferSetAttachment(buffer!, kCVImageBufferColorPrimariesKey, kCVImageBufferColorPrimaries_ITU_R_709_2, .shouldPropagate)
        CVBufferSetAttachment(buffer!, kCVImageBufferTransferFunctionKey, kCVImageBufferTransferFunction_sRGB, .shouldPropagate)
        context.render(image, to: buffer!, bounds: bounds, colorSpace: colorSpace)
        return buffer!
    }
    func writePNG(_ buffer: CVPixelBuffer, path: String) throws {
        // Exclusive creation preserves previous captures, even when a path is reused accidentally.
        let data = context.pngRepresentation(of: CIImage(cvPixelBuffer: buffer), format: .BGRA8, colorSpace: colorSpace)!
        let fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw CaptureFailure("Create PNG: errno \(errno)") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        try handle.write(contentsOf: data); try handle.close()
    }
}

final class VideoEncoder {
    private var session: VTCompressionSession?
    private let transport: Transport
    private let lock = NSLock()
    private let outputQueue = DispatchQueue(label: "com.cemsarp.zoomtime.capture.transport")
    private var pending = 0, encoded = 0, dropped = 0
    private var failure: Error?
    private var latencyTotal = 0.0, latencyMax = 0.0
    private(set) var hardware = false
    var canAccept: Bool { lock.lock(); defer { lock.unlock() }; return pending < 3 }
    func noteDroppedFrame() { lock.lock(); dropped += 1; lock.unlock() }
    var statistics: [String: Any] {
        lock.lock(); defer { lock.unlock() }
        return ["encoded": encoded, "dropped": dropped, "pending": pending, "hardware": hardware,
                "meanEncodeMs": encoded == 0 ? 0 : latencyTotal / Double(encoded), "maxEncodeMs": latencyMax]
    }
    init(width: Int, height: Int, transport: Transport) throws {
        self.transport = transport
        try check(VTCompressionSessionCreate(allocator: nil, width: Int32(width), height: Int32(height), codecType: kCMVideoCodecType_H264,
            encoderSpecification: [kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: true] as CFDictionary,
            imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: nil, refcon: nil, compressionSessionOut: &session), "Hardware H.264 create")
        do {
            for (key, value) in [(kVTCompressionPropertyKey_RealTime, true as CFTypeRef),
                (kVTCompressionPropertyKey_AllowFrameReordering, false as CFTypeRef),
                (kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Main_AutoLevel as CFTypeRef),
                (kVTCompressionPropertyKey_AverageBitRate, 4_000_000 as CFTypeRef),
                (kVTCompressionPropertyKey_ExpectedFrameRate, 30 as CFTypeRef),
                (kVTCompressionPropertyKey_MaxKeyFrameInterval, 60 as CFTypeRef)] {
                try check(VTSessionSetProperty(session!, key: key, value: value), "Encoder property \(key)")
            }
            try check(VTCompressionSessionPrepareToEncodeFrames(session!), "Encoder prepare")
            var value: Unmanaged<CFTypeRef>?
            try check(VTSessionCopyProperty(session!, key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder, allocator: nil, valueOut: &value), "Hardware encoder query")
            hardware = (value?.takeRetainedValue() as? Bool) == true
            guard hardware else { throw CaptureFailure("Encoder did not confirm hardware acceleration") }
        } catch { VTCompressionSessionInvalidate(session!); throw error }
    }
    func encode(_ buffer: CVPixelBuffer, time: CMTime) throws {
        lock.lock()
        if let failure { lock.unlock(); throw failure }
        guard pending < 3 else { dropped += 1; lock.unlock(); return }
        pending += 1; lock.unlock()
        let start = CFAbsoluteTimeGetCurrent()
        let status = VTCompressionSessionEncodeFrame(session!, imageBuffer: buffer, presentationTimeStamp: time,
            duration: CMTime(value: 1, timescale: 30), frameProperties: nil, infoFlagsOut: nil) { [self] status, flags, sample in
            outputQueue.async { [self] in
                defer { lock.lock(); pending -= 1; lock.unlock() }
                do {
                    try check(status, "H.264 callback")
                    if flags.contains(.frameDropped) { noteDroppedFrame(); return }
                    guard let sample else { throw CaptureFailure("Encoder returned no sample") }
                    try transport.send(sample)
                    let ms = (CFAbsoluteTimeGetCurrent() - start) * 1000
                    lock.lock(); encoded += 1; latencyTotal += ms; latencyMax = max(latencyMax, ms); lock.unlock()
                } catch { lock.lock(); failure = error; lock.unlock() }
            }
        }
        if status != noErr { lock.lock(); pending -= 1; lock.unlock(); try check(status, "H.264 submit") }
    }
    func finish() throws {
        guard let session else { return }
        let status = VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
        VTCompressionSessionInvalidate(session); self.session = nil
        try outputQueue.sync { try transport.close() }
        try check(status, "H.264 drain")
        if let failure { throw failure }
    }
    deinit { if let session { VTCompressionSessionInvalidate(session) } }
}
