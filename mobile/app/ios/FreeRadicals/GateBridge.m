#import <React/RCTBridgeModule.h>

// Exposes the Swift class above to React Native. The method signatures must
// match GateBridge.swift exactly; a mismatch fails silently at runtime, with
// the JS call simply never arriving.
@interface RCT_EXTERN_MODULE (FreeRadicals, NSObject)

RCT_EXTERN_METHOD(setGateState:(NSDictionary *)state)
RCT_EXTERN_METHOD(isAuthorized:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestAuthorization:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(presentAppPicker)

@end
