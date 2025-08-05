# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['back/server.py'],
    pathex=[],
    binaries=[],
    datas=[
      ('.venv/lib/python3.12/site-packages/magika/models', 'magika/models'),
      ('.venv/lib/python3.12/site-packages/magika/config', 'magika/config')
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
