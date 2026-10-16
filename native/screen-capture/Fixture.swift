import AppKit

final class PatternView: NSView {
    let color: NSColor
    let label: String
    init(color: NSColor, label: String) { self.color = color; self.label = label; super.init(frame: .zero) }
    required init?(coder: NSCoder) { fatalError() }
    override func draw(_ dirtyRect: NSRect) {
        color.setFill(); bounds.fill()
        NSColor.white.setFill(); NSRect(x: 30, y: 40, width: 100, height: 90).fill()
        (label as NSString).draw(at: NSPoint(x: 25, y: bounds.height - 60), withAttributes: [.font: NSFont.boldSystemFont(ofSize: 24), .foregroundColor: NSColor.white])
    }
}
@main struct Fixture {
    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.regular)
        var windows: [NSWindow] = []
        for (index, color) in [NSColor.red, NSColor.blue].enumerated() {
            let title = "ZoomTime Capture Fixture \(index)"
            let window = NSWindow(contentRect: NSRect(x: 100 + index * 600, y: 220, width: 500, height: 400), styleMask: [.titled, .resizable, .closable], backing: .buffered, defer: false)
            window.title = title; window.contentView = PatternView(color: color, label: title); window.makeKeyAndOrderFront(nil); windows.append(window)
            window.isReleasedWhenClosed = false
        }
        let retained = windows
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            retained[0].setFrame(NSRect(x: 160, y: 140, width: 640, height: 340), display: true)
            retained[1].setFrameOrigin(NSPoint(x: 900, y: 300))
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { retained[0].close() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { app.terminate(nil) }
        app.activate(ignoringOtherApps: false); app.run()
    }
}
