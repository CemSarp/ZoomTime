import Foundation
import VideoToolbox
import CoreImage
import Metal

@main struct Inspect {
    static func main() throws {
        let path = CommandLine.arguments[1]
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        var nals: [Data] = [], start = 0, cursor = 0
        while cursor + 4 <= data.count {
            if data[cursor] == 0 && data[cursor + 1] == 0 && data[cursor + 2] == 0 && data[cursor + 3] == 1 {
                if cursor > start { nals.append(data[start..<cursor]) }
                start = cursor + 4; cursor += 4
            } else { cursor += 1 }
        }
        if start < data.count { nals.append(data[start...]) }
        guard let sps = nals.first(where: { $0.first! & 31 == 7 }), let pps = nals.first(where: { $0.first! & 31 == 8 }) else { throw CaptureFailure("Missing SPS/PPS") }
        var format: CMFormatDescription?
        try sps.withUnsafeBytes { s in try pps.withUnsafeBytes { p in
            var pointers = [s.baseAddress!.assumingMemoryBound(to: UInt8.self), p.baseAddress!.assumingMemoryBound(to: UInt8.self)]
            var lengths = [sps.count, pps.count]
            try check(CMVideoFormatDescriptionCreateFromH264ParameterSets(allocator: nil, parameterSetCount: 2, parameterSetPointers: &pointers,
                parameterSetSizes: &lengths, nalUnitHeaderLength: 4, formatDescriptionOut: &format), "H.264 parse")
        } }
        var decoder: VTDecompressionSession?, frames = 0, last: CVPixelBuffer?, first: CVPixelBuffer?
        try check(VTDecompressionSessionCreate(allocator: nil, formatDescription: format!, decoderSpecification: nil,
            imageBufferAttributes: [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA] as CFDictionary,
            outputCallback: nil, decompressionSessionOut: &decoder), "Decoder create")
        for nal in nals {
            let type = nal.first! & 31
            guard type == 1 || type == 5 else { continue }
            var payload = Data(); var length = UInt32(nal.count).bigEndian
            withUnsafeBytes(of: &length) { payload.append(contentsOf: $0) }; payload.append(nal)
            var block: CMBlockBuffer?
            try check(CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: payload.count, blockAllocator: nil,
                customBlockSource: nil, offsetToData: 0, dataLength: payload.count, flags: 0, blockBufferOut: &block), "Decode block")
            try payload.withUnsafeBytes { try check(CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: block!, offsetIntoDestination: 0, dataLength: payload.count), "Decode bytes") }
            var sample: CMSampleBuffer?, size = payload.count
            var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 30), presentationTimeStamp: CMTime(value: Int64(frames), timescale: 30), decodeTimeStamp: .invalid)
            try check(CMSampleBufferCreateReady(allocator: nil, dataBuffer: block, formatDescription: format!, sampleCount: 1,
                sampleTimingEntryCount: 1, sampleTimingArray: &timing, sampleSizeEntryCount: 1, sampleSizeArray: &size, sampleBufferOut: &sample), "Decode sample")
            try check(VTDecompressionSessionDecodeFrame(decoder!, sampleBuffer: sample!, flags: [], infoFlagsOut: nil) { status, _, image, _, _ in
                precondition(status == noErr && image != nil, "Every saved sample must decode")
                frames += 1; last = image; if first == nil { first = image }
            }, "Decode submit")
        }
        VTDecompressionSessionWaitForAsynchronousFrames(decoder!)
        VTDecompressionSessionInvalidate(decoder!)
        guard let last, let first else { throw CaptureFailure("No decoded frames") }
        let renderer = try CompositeFrameRenderer(width: 1280, height: 720)
        try renderer.writePNG(first, path: path + ".decoded-first.png")
        try renderer.writePNG(last, path: path + ".decoded-last.png")
        var pixels = 0, red = 0, blue = 0
        CVPixelBufferLockBaseAddress(last, .readOnly)
        let bytes = CVPixelBufferGetBaseAddress(last)!.assumingMemoryBound(to: UInt8.self)
        for y in stride(from: 0, to: CVPixelBufferGetHeight(last), by: 8) {
            for x in stride(from: 0, to: CVPixelBufferGetWidth(last), by: 8) {
                let offset = y * CVPixelBufferGetBytesPerRow(last) + x * 4
                if bytes[offset] > 40 || bytes[offset + 1] > 40 || bytes[offset + 2] > 40 { pixels += 1 }
                if bytes[offset + 2] > 150 && bytes[offset] < 80 { red += 1 }
                if bytes[offset] > 150 && bytes[offset + 2] < 80 { blue += 1 }
            }
        }
        CVPixelBufferUnlockBaseAddress(last, .readOnly)
        precondition(pixels > 100, "Captured output must contain visible content")
        print("{\"decodedFrames\":\(frames),\"visibleSampledPixels\":\(pixels),\"red\":\(red),\"blue\":\(blue),\"width\":\(CVPixelBufferGetWidth(last)),\"height\":\(CVPixelBufferGetHeight(last))}")
    }
}
