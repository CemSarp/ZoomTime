import Foundation
import CoreGraphics

@main struct CaptureMain {
    static func main() async {
        var pipeline: CapturePipeline?
        do {
            let arguments = CommandLine.arguments
            switch arguments.count > 1 ? arguments[1] : "" {
            case "permission": emit(["type": "permission", "granted": CGPreflightScreenCaptureAccess()])
            case "request": emit(["type": "permission", "granted": CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess()])
            case "discover": emit(inventory(try await discover()))
            case "capture":
                guard arguments.count == 4 else { throw CaptureFailure("capture requires selection JSON and exclusive output path") }
                let selection = try JSONDecoder().decode(Selection.self, from: Data(arguments[2].utf8))
                try selection.validate()
                guard CGPreflightScreenCaptureAccess() else { throw ScreenPermissionFailure() }
                pipeline = try CapturePipeline(path: arguments[3])
                try await pipeline!.select(selection)
                while let line = await Task.detached(operation: { readLine() }).value {
                    if line == "stop" { break }
                    do { try await pipeline!.select(JSONDecoder().decode(Selection.self, from: Data(line.utf8))) }
                    catch { emit(["type": "selection-error", "message": error.localizedDescription]) }
                }
                try await pipeline!.stop(); pipeline = nil
            case "probe": try capabilityProbe()
            default: throw CaptureFailure("Use permission, request, discover, capture or probe")
            }
        } catch {
            if let pipeline { try? await pipeline.stop() }
            let ns = error as NSError
            emit(["type": "error", "reason": error is ScreenPermissionFailure ? "screen-permission" : "capture-failed", "message": error.localizedDescription, "domain": ns.domain, "code": ns.code])
            exit(1)
        }
    }
}
