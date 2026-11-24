// Regions sit below Chromium and sample the live desktop through AppKit.
#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <node_api.h>
#include <cmath>
#include <cstring>

@interface CocoGlassRegions : NSView
@property CGFloat railFraction;
@property CGFloat footerFraction;
@property(strong) NSVisualEffectView *rail;
@property(strong) NSVisualEffectView *content;
@property(strong) NSVisualEffectView *footer;
@end

@implementation CocoGlassRegions
- (BOOL)isFlipped { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; }

- (NSVisualEffectView *)panel:(NSVisualEffectMaterial)material {
  NSVisualEffectView *view = [[NSVisualEffectView alloc] initWithFrame:NSZeroRect];
  view.blendingMode = NSVisualEffectBlendingModeBehindWindow;
  view.material = material;
  view.state = NSVisualEffectStateActive;
  [self addSubview:view];
  return view;
}

- (instancetype)initWithFrame:(NSRect)frame {
  if ((self = [super initWithFrame:frame])) {
    self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    _rail = [self panel:NSVisualEffectMaterialSidebar];
    _content = [self panel:NSVisualEffectMaterialUnderWindowBackground];
    _footer = [self panel:NSVisualEffectMaterialHUDWindow];
  }
  return self;
}

- (void)layout {
  [super layout];
  CGFloat width = NSWidth(self.bounds), height = NSHeight(self.bounds);
  CGFloat rail = round(width * self.railFraction);
  CGFloat top = height - round(height * self.footerFraction);
  self.rail.frame = NSMakeRect(0, 0, rail, top);
  self.content.frame = NSMakeRect(rail, 0, width - rail, top);
  self.footer.frame = NSMakeRect(0, top, width, height - top);
}
@end

static char regionsKey;

static napi_value update(napi_env env, napi_callback_info info) {
  napi_value args[4], result;
  napi_get_undefined(env, &result);
  size_t count = 4, size = 0;
  void *bytes = nullptr;
  if (napi_get_cb_info(env, info, &count, args, nullptr, nullptr) != napi_ok ||
      count != 4 || napi_get_buffer_info(env, args[0], &bytes, &size) != napi_ok ||
      size != sizeof(void *) || ![NSThread isMainThread]) return result;
  double values[3];
  for (int i = 0; i < 3; ++i) {
    if (napi_get_value_double(env, args[i + 1], &values[i]) != napi_ok ||
        !std::isfinite(values[i]) || values[i] < 0 || values[i] > 1) return result;
  }
  @autoreleasepool {
    void *pointer = nullptr;
    memcpy(&pointer, bytes, sizeof(pointer));
    NSView *electronView = (__bridge NSView *)pointer;
    NSView *host = electronView.window.contentView;
    if (!host) return result;
    CocoGlassRegions *regions = objc_getAssociatedObject(host, &regionsKey);
    if (values[2] == 0) {
      [regions removeFromSuperview];
      objc_setAssociatedObject(host, &regionsKey, nil, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      return result;
    }
    if (!regions) {
      regions = [[CocoGlassRegions alloc] initWithFrame:host.bounds];
      [host addSubview:regions positioned:NSWindowBelow relativeTo:nil];
      objc_setAssociatedObject(host, &regionsKey, regions, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    regions.railFraction = values[0];
    regions.footerFraction = values[1];
    // AppKit owns blur radii. Blend each material with the clear window independently.
    regions.content.alphaValue = 0.12 * values[2];
    regions.rail.alphaValue = 0.55 * values[2];
    regions.footer.alphaValue = values[2];
    regions.needsLayout = YES;
  }
  return result;
}

NAPI_MODULE_INIT() {
  napi_value fn;
  napi_create_function(env, "update", NAPI_AUTO_LENGTH, update, nullptr, &fn);
  napi_set_named_property(env, exports, "update", fn);
  return exports;
}
