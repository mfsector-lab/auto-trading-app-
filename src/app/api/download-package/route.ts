import { NextResponse } from 'next/server';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import JSZip from 'jszip';

const SOURCE_DIRS = ['src', 'public', 'bridge'];
const SOURCE_FILES = ['README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts'];

function projectPath(...segments: string[]) {
  return join(/*turbopackIgnore: true*/ process.cwd(), ...segments);
}

function addDesktopScaffold(zip: JSZip) {
  zip.file(
    'desktop/README.txt',
    `TradeAutomate Desktop App\n========================\n\nThis package wraps TradeAutomate in a desktop app window (Electron).\n\nQuick start:\n1) Install Node.js LTS\n2) Open terminal in desktop/\n3) npm install\n4) npm run dev\n\nBuild installers:\n- Windows: npm run build:win\n- macOS: npm run build:mac\n- Linux: npm run build:linux\n\nDefault app target is the public URL:\nhttps://tradeautomate-ai.vercel.app\n\nTo target another URL, set env APP_URL before run/build.\n`
  );

  zip.file(
    'desktop/package.json',
    JSON.stringify(
      {
        name: 'tradeautomate-desktop',
        version: '1.0.0',
        private: true,
        description: 'TradeAutomate AI desktop app wrapper',
        main: 'main.js',
        scripts: {
          dev: 'electron .',
          'build:win': 'electron-builder --win nsis',
          'build:mac': 'electron-builder --mac dmg',
          'build:linux': 'electron-builder --linux AppImage',
        },
        devDependencies: {
          electron: '^33.2.1',
          'electron-builder': '^25.1.8',
        },
        build: {
          appId: 'com.tradeautomate.desktop',
          productName: 'TradeAutomate AI',
          directories: {
            output: 'release',
          },
          files: ['main.js'],
          win: {
            target: ['nsis'],
          },
          mac: {
            target: ['dmg'],
          },
          linux: {
            target: ['AppImage'],
          },
        },
      },
      null,
      2
    )
  );

  zip.file(
    'desktop/main.js',
    `const { app, BrowserWindow, shell } = require('electron');\n\nconst APP_URL = process.env.APP_URL || 'https://tradeautomate-ai.vercel.app';\n\nfunction createWindow() {\n  const win = new BrowserWindow({\n    width: 1366,\n    height: 860,\n    minWidth: 1100,\n    minHeight: 680,\n    autoHideMenuBar: true,\n    title: 'TradeAutomate AI',\n    webPreferences: {\n      contextIsolation: true,\n      sandbox: true,\n    },\n  });\n\n  win.webContents.setWindowOpenHandler(({ url }) => {\n    shell.openExternal(url);\n    return { action: 'deny' };\n  });\n\n  win.loadURL(APP_URL);\n}\n\napp.whenReady().then(() => {\n  createWindow();\n\n  app.on('activate', function () {\n    if (BrowserWindow.getAllWindows().length === 0) createWindow();\n  });\n});\n\napp.on('window-all-closed', function () {\n  if (process.platform !== 'darwin') app.quit();\n});\n`
  );
}

async function addFileIfExists(zip: JSZip, diskPath: string, zipPath: string) {
  try {
    const content = await readFile(diskPath);
    zip.file(zipPath, content);
  } catch {
    // ignore missing optional files
  }
}

async function addDirRecursive(zip: JSZip, root: string, relativeDir: string) {
  const absDir = join(root, relativeDir);
  let items: string[] = [];
  try {
    items = await readdir(absDir);
  } catch {
    return;
  }

  for (const item of items) {
    const rel = join(relativeDir, item);
    const normalized = rel.replace(/\\/g, '/');
    if (normalized.includes('/node_modules/') || normalized.includes('/.next/') || normalized.includes('/.git/') || normalized.includes('/.vercel/')) {
      continue;
    }

    const abs = join(root, rel);
    try {
      const child = await readdir(abs);
      if (Array.isArray(child)) {
        await addDirRecursive(zip, root, rel);
        continue;
      }
    } catch {
      await addFileIfExists(zip, abs, normalized);
    }
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') ?? 'app';
  const label = ['full', 'windows', 'site', 'ios', 'app', 'macos', 'linux', 'desktop'].includes(type) ? type : 'app';

  const zip = new JSZip();

  if (label === 'full' || label === 'site') {
    zip.file(
      'README.txt',
      `TradeAutomate AI ${label} package\n=============================\n\nThis bundle includes web app source + python bridge + MT4/MT5 EA files to run on other computers.\n`
    );
    for (const topFile of SOURCE_FILES) {
      await addFileIfExists(zip, projectPath(topFile), topFile);
    }
    for (const dir of SOURCE_DIRS) {
      await addDirRecursive(zip, projectPath(), dir);
    }
  } else if (label === 'windows') {
    zip.file(
      'README.txt',
      `TradeAutomate AI Windows package\n=============================\n\nDirect EA-to-cloud setup (no local bridge process needed):\n1) Attach TradeAutomate-EA.mq4 or TradeAutomate-EA.mq5 to your chart\n2) Set EA AppURL and EventURL to https://tradeautomate-ai.vercel.app/api/signals\n3) Leave RequiredAccountMode on AUTO unless you want to force LIVE or DEMO only\n4) Set EA ClientId to the same 4-digit PIN used in the dashboard\n5) In MT4/MT5 allow WebRequest URL: https://tradeautomate-ai.vercel.app\n`
    );
    await addFileIfExists(zip, projectPath('public', 'TradeAutomate-EA.mq4'), 'TradeAutomate-EA.mq4');
    await addFileIfExists(zip, projectPath('public', 'TradeAutomate-EA.mq5'), 'TradeAutomate-EA.mq5');
    await addFileIfExists(zip, projectPath('bridge', 'bridge.py'), 'bridge/bridge.py');
    await addFileIfExists(zip, projectPath('bridge', 'requirements.txt'), 'bridge/requirements.txt');
    await addFileIfExists(zip, projectPath('bridge', 'README.md'), 'bridge/README.md');
  } else if (label === 'desktop') {
    zip.file(
      'README.txt',
      `TradeAutomate AI desktop package\n=============================\n\nThis package includes full source plus an Electron desktop app wrapper so users can run TradeAutomate as a desktop app window.\n`
    );
    for (const topFile of SOURCE_FILES) {
      await addFileIfExists(zip, projectPath(topFile), topFile);
    }
    for (const dir of SOURCE_DIRS) {
      await addDirRecursive(zip, projectPath(), dir);
    }
    addDesktopScaffold(zip);
  } else {
    zip.file(
      'README.txt',
      `TradeAutomate AI ${label} bundle\n=============================\n\nInstall the web app from browser or use this package for offline setup.\n`
    );
    await addFileIfExists(zip, projectPath('public', 'TradeAutomate-EA.mq4'), 'TradeAutomate-EA.mq4');
    await addFileIfExists(zip, projectPath('public', 'TradeAutomate-EA.mq5'), 'TradeAutomate-EA.mq5');
    await addFileIfExists(zip, projectPath('public', 'icon.svg'), 'icon.svg');
    zip.file(
      'manifest.webmanifest',
      JSON.stringify(
        {
          name: 'TradeAutomate AI',
          short_name: 'TradeAutomate',
          start_url: '/',
          display: 'standalone',
          background_color: '#0f172a',
          theme_color: '#2563eb',
        },
        null,
        2
      )
    );
  }

  const body = await zip.generateAsync({ type: 'nodebuffer' });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=tradeautomate-${label}-bundle.zip`,
      'Cache-Control': 'no-store',
    },
  });
}
