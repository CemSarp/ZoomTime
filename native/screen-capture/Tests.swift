import Foundation
import CoreImage
import VideoToolbox

final class CheckingTransport: Transport {
    let file: LocalFileTransport
    var samples: [CMSampleBuffer] = []
    init(_ path: String) throws { file = try LocalFileTransport(path: path) }
    func send(_ sample: CMSampleBuffer) throws { try file.send(sample); samples.append(sample) }
    func close() throws { try file.close() }
}
final class SlowTransport: Transport {
    var frames = 0
    func send(_ sample: CMSampleBuffer) throws { Thread.sleep(forTimeInterval: 0.05); frames += 1 }
    func close() throws {}
}
final class FailedTransport: Transport {
    func send(_ sample: CMSampleBuffer) throws { throw CaptureFailure("injected output failure") }
    func close() throws {}
}

@main struct Tests {
    static func main() throws {
        precondition(!allowedCaptureApplication("com.apple.FaceTime"))
        precondition(allowedCaptureApplication("com.cemsarp.zoomtime") && allowedCaptureApplication(nil))
        let path = CommandLine.arguments[1]
        let renderer = try CompositeFrameRenderer(width: 1280, height: 720)
        let red = CIImage(color: CIColor(red: 1, green: 0, blue: 0)).cropped(to: CGRect(x: 0, y: 0, width: 640, height: 720))
        let blue = CIImage(color: CIColor(red: 0, green: 0, blue: 1)).cropped(to: red.extent)
        let transport = try CheckingTransport(path)
        let encoder = try VideoEncoder(width: 1280, height: 720, transport: transport)
        let start = CFAbsoluteTimeGetCurrent()
        for index in 0..<120 {
            let buffer = try renderer.render([red, blue])
            if index == 0 {
                try renderer.writePNG(buffer, path: path + ".png")
                CVPixelBufferLockBaseAddress(buffer, .readOnly)
                let p = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
                let row = CVPixelBufferGetBytesPerRow(buffer)
                precondition(p[360 * row + 320 * 4 + 2] > 240, "left tile must be red")
                precondition(p[360 * row + 960 * 4] > 240, "right tile must be blue")
                CVPixelBufferUnlockBaseAddress(buffer, .readOnly)
            }
            while !encoder.canAccept { Thread.sleep(forTimeInterval: 0.001) }
            try encoder.encode(buffer, time: CMTime(value: Int64(index), timescale: 30))
        }
        try encoder.finish()
        precondition(encoder.hardware, "hardware encoder required")
        precondition(transport.samples.count == 120, "every frame encoded")
        let sample = transport.samples[0]
        var decoder: VTDecompressionSession?
        try check(VTDecompressionSessionCreate(allocator: nil, formatDescription: CMSampleBufferGetFormatDescription(sample)!, decoderSpecification: nil,
            imageBufferAttributes: [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA] as CFDictionary,
            outputCallback: nil, decompressionSessionOut: &decoder), "decoder create")
        var decoded = false
        try check(VTDecompressionSessionDecodeFrame(decoder!, sampleBuffer: sample, flags: [], infoFlagsOut: nil) { status, _, image, _, _ in
            precondition(status == noErr && image != nil, "decode must return pixels")
            CVPixelBufferLockBaseAddress(image!, .readOnly)
            let p = CVPixelBufferGetBaseAddress(image!)!.assumingMemoryBound(to: UInt8.self)
            let row = CVPixelBufferGetBytesPerRow(image!)
            precondition(p[360 * row + 320 * 4 + 2] > 200 && p[360 * row + 960 * 4] > 200, "encoded image retains both colors")
            CVPixelBufferUnlockBaseAddress(image!, .readOnly)
            decoded = true
        }, "decode")
        VTDecompressionSessionWaitForAsynchronousFrames(decoder!)
        VTDecompressionSessionInvalidate(decoder!)
        precondition(decoded)
        let slowTransport = SlowTransport()
        let slowEncoder = try VideoEncoder(width: 1280, height: 720, transport: slowTransport)
        let slowBuffer = try renderer.render([red, blue])
        for index in 0..<20 {
            if slowEncoder.canAccept { try slowEncoder.encode(slowBuffer, time: CMTime(value: Int64(index), timescale: 30)) }
            else { slowEncoder.noteDroppedFrame() }
        }
        try slowEncoder.finish()
        precondition((slowEncoder.statistics["dropped"] as! Int) > 0, "Backpressure must be reported")
        precondition(slowTransport.frames > 0 && slowTransport.frames <= 3, "Transport queue must remain bounded")
        let failedEncoder = try VideoEncoder(width: 1280, height: 720, transport: FailedTransport())
        try failedEncoder.encode(slowBuffer, time: .zero)
        do { try failedEncoder.finish(); preconditionFailure("Transport failure must propagate") }
        catch { precondition(error.localizedDescription == "injected output failure") }
        let data = try Data(contentsOf: URL(fileURLWithPath: path))
        precondition(data.starts(with: [0, 0, 0, 1]))
        do { _ = try LocalFileTransport(path: path); preconditionFailure("must not overwrite existing output") } catch {}
        let elapsed = CFAbsoluteTimeGetCurrent() - start
        print("{\"test\":\"synthetic-composition-hardware-encode-decode\",\"frames\":120,\"hardware\":true,\"decodedColorsVerified\":true,\"seconds\":\(elapsed),\"fps\":\(120 / elapsed),\"bytes\":\(data.count)}")
    }
}
