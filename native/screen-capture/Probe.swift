import Foundation
import CoreGraphics
import CoreVideo
import IOSurface
import Darwin

func capabilityProbe() throws {
    let libraries = ["/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
                     "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",
                     "/System/Library/Frameworks/IOSurface.framework/IOSurface"]
    let symbols = ["CGWindowListCreateImage", "CGDisplayCreateImage", "CGDisplayStreamCreateWithDispatchQueue",
                   "CGSHWCaptureWindowList", "SLSHWCaptureWindowList", "CGSGetWindowCaptureBounds", "SLSGetWindowCaptureBounds",
                   "IOSurfaceLookup", "IOSurfaceGetBaseAddress", "IOSurfaceCreate"]
    var availability: [[String: Any]] = []
    for library in libraries {
        guard let handle = dlopen(library, RTLD_LAZY | RTLD_LOCAL) else { availability.append(["library": library, "loaded": false]); continue }
        for symbol in symbols { availability.append(["lookupScope": library, "symbol": symbol, "available": dlsym(handle, symbol) != nil]) }
        dlclose(handle)
    }
    guard let surface = IOSurfaceCreate([kIOSurfaceWidth: 16, kIOSurfaceHeight: 16, kIOSurfaceBytesPerElement: 4,
        kIOSurfaceBytesPerRow: 64, kIOSurfaceAllocSize: 1024, kIOSurfacePixelFormat: kCVPixelFormatType_32BGRA] as CFDictionary) else { throw CaptureFailure("IOSurfaceCreate returned nil") }
    let lock = IOSurfaceLock(surface, [], nil)
    var ownBytesVerified = false
    if lock == KERN_SUCCESS {
        let base = IOSurfaceGetBaseAddress(surface)
        memset(base, 0x5a, IOSurfaceGetAllocSize(surface))
        ownBytesVerified = base.load(as: UInt8.self) == 0x5a
    }
    let unlock = lock == KERN_SUCCESS ? IOSurfaceUnlock(surface, [], nil) : lock
    let lookup = IOSurfaceLookup(IOSurfaceGetID(surface))
    emit(["type": "capability-probe", "os": ProcessInfo.processInfo.operatingSystemVersionString, "effectiveUID": geteuid(),
          "screenPermission": CGPreflightScreenCaptureAccess(), "symbols": availability,
          "ownedIOSurface": ["create": true, "lock": lock, "unlock": unlock, "lookupOwnID": lookup != nil, "bytesVerified": ownBytesVerified],
          "protectedPixels": "unverified/unsupported: own IOSurface mapping does not grant another process's protected surfaces",
          "privateCalls": "none: no authoritative ABI/privilege contract established; symbol presence alone is insufficient"])
}
