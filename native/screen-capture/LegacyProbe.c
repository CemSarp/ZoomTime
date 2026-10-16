#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <string.h>
#include <IOSurface/IOSurface.h>
#include <dispatch/dispatch.h>

static void inspect(const char *name, CGImageRef image, const char *directory) {
    if (!image) { printf("{\"interface\":\"%s\",\"image\":false}\n", name); return; }
    char output[4096];
    snprintf(output, sizeof(output), "%s/%s.png", directory, name);
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(NULL, (const UInt8 *)output, strlen(output), false);
    CGImageDestinationRef destination = CGImageDestinationCreateWithURL(url, CFSTR("public.png"), 1, NULL);
    bool saved = false;
    if (destination) { CGImageDestinationAddImage(destination, image, NULL); saved = CGImageDestinationFinalize(destination); CFRelease(destination); }
    printf("{\"interface\":\"%s\",\"image\":true,\"width\":%zu,\"height\":%zu,\"pngSaved\":%s}\n", name, CGImageGetWidth(image), CGImageGetHeight(image), saved ? "true" : "false");
    CFRelease(url); CGImageRelease(image);
}
int main(int argc, const char **argv) {
    if (argc != 2) return 2;
    CFArrayRef windows = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID);
    bool faceTimeVisible = false;
    if (windows) {
        for (CFIndex index = 0; index < CFArrayGetCount(windows); index++) {
            CFDictionaryRef window = CFArrayGetValueAtIndex(windows, index);
            CFStringRef owner = CFDictionaryGetValue(window, kCGWindowOwnerName);
            if (owner && CFEqual(owner, CFSTR("FaceTime"))) faceTimeVisible = true;
        }
        CFRelease(windows);
    }
    if (faceTimeVisible) { printf("{\"skipped\":\"FaceTime visible; unfiltered desktop probe would include an excluded application\"}\n"); return 2; }
    if (!CGPreflightScreenCaptureAccess()) { printf("{\"permission\":false}\n"); return 1; }
    // SDK-declared ABIs only; these obsolete public APIs are never production capture sources.
    inspect("CGDisplayCreateImage", CGDisplayCreateImage(CGMainDisplayID()), argv[1]);
    inspect("CGWindowListCreateImage", CGWindowListCreateImage(CGRectInfinite, kCGWindowListOptionOnScreenOnly, kCGNullWindowID, kCGWindowImageDefault), argv[1]);
    dispatch_queue_t queue = dispatch_queue_create("zoomtime.legacy-probe", DISPATCH_QUEUE_SERIAL);
    dispatch_semaphore_t frame = dispatch_semaphore_create(0), stopped = dispatch_semaphore_create(0);
    __block bool captured = false;
    const char *directory = argv[1];
    CGDisplayStreamRef stream = CGDisplayStreamCreateWithDispatchQueue(CGMainDisplayID(), 1280, 720, 'BGRA', NULL, queue,
        ^(CGDisplayStreamFrameStatus status, uint64_t time, IOSurfaceRef surface, CGDisplayStreamUpdateRef update) {
            if (status == kCGDisplayStreamFrameStatusStopped) { dispatch_semaphore_signal(stopped); return; }
            if (captured || status != kCGDisplayStreamFrameStatusFrameComplete || !surface) return;
            captured = true;
            kern_return_t locked = IOSurfaceLock(surface, kIOSurfaceLockReadOnly, NULL);
            printf("{\"interface\":\"CGDisplayStreamFrame\",\"status\":%d,\"lock\":%d}\n", status, locked);
            if (locked == KERN_SUCCESS) {
                CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
                CGDataProviderRef provider = CGDataProviderCreateWithData(NULL, IOSurfaceGetBaseAddress(surface), IOSurfaceGetAllocSize(surface), NULL);
                CGImageRef image = CGImageCreate(IOSurfaceGetWidth(surface), IOSurfaceGetHeight(surface), 8, 32, IOSurfaceGetBytesPerRow(surface),
                    space, kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst, provider, NULL, false, kCGRenderingIntentDefault);
                inspect("CGDisplayStream", image, directory);
                CGDataProviderRelease(provider); CGColorSpaceRelease(space); IOSurfaceUnlock(surface, kIOSurfaceLockReadOnly, NULL);
            }
            dispatch_semaphore_signal(frame);
        });
    if (stream) {
        CGError started = CGDisplayStreamStart(stream);
        long waited = started == kCGErrorSuccess ? dispatch_semaphore_wait(frame, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC)) : -1;
        CGError stop = CGDisplayStreamStop(stream);
        long stopWait = dispatch_semaphore_wait(stopped, dispatch_time(DISPATCH_TIME_NOW, 3 * NSEC_PER_SEC));
        printf("{\"interface\":\"CGDisplayStream\",\"created\":true,\"start\":%d,\"frameWait\":%ld,\"stop\":%d,\"stopWait\":%ld}\n", started, waited, stop, stopWait);
        if (stopWait == 0) CFRelease(stream);
    } else printf("{\"interface\":\"CGDisplayStream\",\"created\":false}\n");
    return 0;
}
