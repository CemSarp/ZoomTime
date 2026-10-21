import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadSigningPolicy, signingRequirement, normalizeBundlePermissions, verifyPinnedCode, skipNonCodeSigning } from './src/release-signing.ts';
import { requireAppleSilicon } from './src/platform.ts';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';
import { CONTENT_SECURITY_POLICY, CALL_PERMISSIONS_POLICY } from './src/security.ts';

const signing = loadSigningPolicy(resolve('build/signing-policy.json'));
const normalized = new Set<string>();
const config: ForgeConfig = {
  hooks: {
    postPackage: async (_config, result) => {
      for (const output of result.outputPaths) {
        const app = resolve(output, 'ZoomTime.app');
        await verifyPinnedCode(app, signing, signing.appId);
        await verifyPinnedCode(resolve(app, 'Contents/Resources/ZoomTimeCapture'), signing, signing.helperId);
      }
    },
    prePackage: async (forgeConfig, _platform, arch) => {
      requireAppleSilicon(arch);
      execFileSync(process.execPath, ['scripts/build-capture.mjs', arch], { stdio: 'inherit' });
      forgeConfig.packagerConfig!.extraResource = [resolve('out', 'native', arch, 'ZoomTimeCapture'), resolve('build/signing-policy.json')];
    },
  },
  packagerConfig: {
    asar: true,
    appBundleId: 'com.cemsarp.zoomtime',
    appCategoryType: 'public.app-category.social-networking',
    appCopyright: 'Private ZoomTime prototype',
    extendInfo: { LSMinimumSystemVersion: '14.0', ElectronSquirrelPreventDowngrades: true,
      NSScreenCaptureUsageDescription: 'ZoomTime captures a display or selected windows only when you start a local screen-capture diagnostic. Protected video is not supported.',
      NSAudioCaptureUsageDescription: 'ZoomTime uses Mac playback as a reference for optional speaker echo reduction during a call or device check. Playback is not recorded or sent.',
      NSCameraUsageDescription: 'ZoomTime uses your camera when you start or accept a private call, or explicitly start a local camera and microphone check.',
      NSMicrophoneUsageDescription: 'ZoomTime uses your microphone when you start or accept a private call, or explicitly start a local camera and microphone check.' },
    osxSign: {
      identity: signing.certificateSha1, identityValidation: false,
      ignore: skipNonCodeSigning,
      // Private signing has no Apple Team ID; preserve the existing entitlement/runtime policy.
      optionsForFile: file => {
        const root = file.slice(0, file.indexOf('/ZoomTime.app') + '/ZoomTime.app'.length);
        if (!normalized.has(root)) { normalizeBundlePermissions(root); normalized.add(root); }
        return ({ ...(file.endsWith('/ZoomTime.app') ? { requirements: '=designated => ' + signingRequirement(signing, signing.appId) } : {}), timestamp: 'none', hardenedRuntime: false, entitlements: ['com.apple.security.cs.allow-jit', 'com.apple.security.device.camera', 'com.apple.security.device.audio-input'] });
      },
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ['darwin']),
  ],
  plugins: [
    new WebpackPlugin({
      mainConfig,
      devContentSecurityPolicy: CONTENT_SECURITY_POLICY,
      devServer: { host: '127.0.0.1', hot: false, liveReload: false, client: false,
        headers: { 'Permissions-Policy': CALL_PERMISSIONS_POLICY } },
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
