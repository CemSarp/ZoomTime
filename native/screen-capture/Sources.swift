import Foundation
import ScreenCaptureKit
import CoreImage

struct Selection: Codable {
    let kind: String
    let ids: [UInt32]
    func validate() throws {
        guard (kind == "display" && ids.count == 1) || (kind == "window" && (1...4).contains(ids.count)),
              Set(ids).count == ids.count, ids.allSatisfy({ $0 > 0 }) else { throw CaptureFailure("Invalid source selection") }
    }
}
func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
    FileHandle.standardOutput.write(data + Data([10]))
}
struct ScreenPermissionFailure: LocalizedError {
    var errorDescription: String? { "Screen Recording is not authorized for this copy of ZoomTime. Enable the current app in System Settings, then quit and reopen it." }
}
func discover() async throws -> SCShareableContent {
    guard CGPreflightScreenCaptureAccess() else { throw ScreenPermissionFailure() }
    return try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
}
func allowedCaptureApplication(_ identifier: String?) -> Bool { identifier != "com.apple.FaceTime" }
func inventory(_ content: SCShareableContent) -> [String: Any] {
    ["type": "sources", "permission": true,
     "displays": content.displays.map { ["id": $0.displayID, "width": $0.width, "height": $0.height] },
     "windows": content.windows.filter { allowedCaptureApplication($0.owningApplication?.bundleIdentifier) && $0.windowLayer == 0 && $0.frame.width > 1 && $0.frame.height > 1 }.map {
         ["id": $0.windowID, "title": $0.title ?? "Untitled window", "application": $0.owningApplication?.applicationName ?? "Application"]
     }]
}

class ScreenCaptureSource: NSObject, SCStreamOutput, SCStreamDelegate {
    private(set) var stream: SCStream!
    let queue: DispatchQueue
    let changed: (CIImage?, String) -> Void
    init(filter: SCContentFilter, queue: DispatchQueue, changed: @escaping (CIImage?, String) -> Void) throws {
        self.queue = queue; self.changed = changed
        let configuration = SCStreamConfiguration()
        configuration.width = 1280; configuration.height = 720
        configuration.pixelFormat = kCVPixelFormatType_32BGRA
        configuration.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        configuration.queueDepth = 3; configuration.showsCursor = true
        configuration.capturesAudio = false; configuration.scalesToFit = true; configuration.preservesAspectRatio = true
        super.init()
        stream = SCStream(filter: filter, configuration: configuration, delegate: self)
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
    }
    func start() async throws { try await stream.startCapture() }
    func stop() async {
        try? await stream.stopCapture()
        try? stream.removeStreamOutput(self, type: .screen)
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        queue.async { self.changed(nil, "unavailable: \((error as NSError).domain) \((error as NSError).code)") }
    }
    @available(macOS 15.2, *)
    func streamDidBecomeInactive(_ stream: SCStream) {
        queue.async { self.changed(nil, "unavailable: source-closed; protected-content-unknown") }
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = attachments.first?[.status] as? Int, let status = SCFrameStatus(rawValue: raw) else {
            changed(nil, "invalid-frame"); return
        }
        if status == .idle { return }
        guard status == .complete || status == .started else {
            changed(nil, "unavailable-\(raw): protected-content-unknown"); return
        }
        guard CMSampleBufferIsValid(sampleBuffer), let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { changed(nil, "missing-pixels"); return }
        changed(CIImage(cvPixelBuffer: buffer), "complete: protected-content-unknown")
    }
}
final class StandardScreenCaptureSource: ScreenCaptureSource {
    init(display: SCDisplay, excludedApplications: [SCRunningApplication], queue: DispatchQueue, changed: @escaping (CIImage?, String) -> Void) throws {
        try super.init(filter: SCContentFilter(display: display, excludingApplications: excludedApplications, exceptingWindows: []), queue: queue, changed: changed)
    }
}
final class WindowCaptureSource: ScreenCaptureSource {
    init(window: SCWindow, queue: DispatchQueue, changed: @escaping (CIImage?, String) -> Void) throws {
        try super.init(filter: SCContentFilter(desktopIndependentWindow: window), queue: queue, changed: changed)
    }
}

final class CapturePipeline {
    private let queue = DispatchQueue(label: "com.cemsarp.zoomtime.capture", qos: .userInteractive)
    private let renderer: CompositeFrameRenderer
    private let encoder: VideoEncoder
    private var sources: [ScreenCaptureSource] = []
    private var layers: [CIImage?] = [], statuses: [String] = []
    private var timer: DispatchSourceTimer?
    private var generation = 0, frame = 0
    private var started = CMClockGetTime(CMClockGetHostTimeClock())
    private var wrotePNG = false, reportedError = false
    private let path: String
    init(path: String) throws {
        self.path = path
        renderer = try CompositeFrameRenderer(width: 1280, height: 720)
        encoder = try VideoEncoder(width: 1280, height: 720, transport: LocalFileTransport(path: path))
    }
    func select(_ selection: Selection) async throws {
        try selection.validate()
        let content = try await discover()
        // Validate every ID before disturbing the active session.
        if selection.kind == "display" {
            guard content.displays.contains(where: { $0.displayID == selection.ids[0] }) else { throw CaptureFailure("Display no longer available") }
        } else {
            guard selection.ids.allSatisfy({ id in content.windows.contains { $0.windowID == id && allowedCaptureApplication($0.owningApplication?.bundleIdentifier) } }) else { throw CaptureFailure("Window unavailable or excluded by capture policy") }
        }
        queue.sync { generation += 1; layers = Array(repeating: nil, count: selection.ids.count); statuses = Array(repeating: "waiting", count: selection.ids.count) }
        for source in sources { await source.stop() }
        sources = []
        let epoch = queue.sync { generation }
        do {
            for (index, id) in selection.ids.enumerated() {
                let callback: (CIImage?, String) -> Void = { [weak self] image, status in
                    guard let self, self.generation == epoch else { return }
                    self.layers[index] = image; self.statuses[index] = status
                }
                let source: ScreenCaptureSource
                if selection.kind == "display" { source = try StandardScreenCaptureSource(display: content.displays.first { $0.displayID == id }!, excludedApplications: content.applications.filter { !allowedCaptureApplication($0.bundleIdentifier) }, queue: queue, changed: callback) }
                else { source = try WindowCaptureSource(window: content.windows.first { $0.windowID == id }!, queue: queue, changed: callback) }
                sources.append(source); try await source.start()
            }
        } catch {
            for source in sources { await source.stop() }; sources = []
            queue.sync { layers = layers.map { _ in nil }; statuses = statuses.map { _ in "source-start-failed" } }
            throw error
        }
        if timer == nil {
            started = CMClockGetTime(CMClockGetHostTimeClock())
            let timer = DispatchSource.makeTimerSource(queue: queue)
            timer.schedule(deadline: .now(), repeating: .milliseconds(33), leeway: .milliseconds(2))
            timer.setEventHandler { [weak self] in self?.tick() }; self.timer = timer; timer.resume()
        }
        emit(["type": "selected", "kind": selection.kind, "ids": selection.ids])
    }
    private func tick() {
        guard !reportedError else { return }
        do {
            if encoder.canAccept {
                let buffer = try renderer.render(layers)
                try encoder.encode(buffer, time: CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), started))
                if !wrotePNG && layers.allSatisfy({ $0 != nil }) {
                    try renderer.writePNG(buffer, path: path + ".png"); wrotePNG = true
                }
            } else { encoder.noteDroppedFrame() }
            frame += 1
            if frame % 30 == 0 { emit(["type": "statistics", "encoder": encoder.statistics, "sources": statuses, "protectedContent": "unsupported: no verified protected-pixel access or reliable DRM detector"]) }
        } catch {
            reportedError = true; emit(["type": "error", "message": error.localizedDescription])
        }
    }
    func stop() async throws {
        queue.sync { timer?.cancel(); timer = nil; generation += 1 }
        for source in sources { await source.stop() }; sources = []
        try queue.sync { layers = []; try encoder.finish() }
        emit(["type": "stopped", "encoder": encoder.statistics, "previewWritten": wrotePNG])
    }
}
