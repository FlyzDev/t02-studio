# -*- mode: python ; coding: utf-8 -*-
"""Build on Windows: python -m PyInstaller --clean --noconfirm T02-Studio.spec"""

a = Analysis(
    ["src/t02studio/desktop.py"],
    pathex=["src"],
    binaries=[],
    datas=[
        ("src/t02studio/templates", "t02studio/templates"),
        ("src/t02studio/static", "t02studio/static"),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="T02-Studio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
