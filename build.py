import os
import subprocess
import zipfile
import shutil
import hashlib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BUILD_TOOLS = r"C:\Users\Bryan\.gemini\antigravity\scratch\build-tools"

AAPT2 = os.path.join(BUILD_TOOLS, "aapt2.exe")
ANDROID_JAR = os.path.join(BUILD_TOOLS, "android.jar")
R8_JAR = os.path.join(BUILD_TOOLS, "r8.jar")
UBER_SIGNER = os.path.join(BUILD_TOOLS, "uber-apk-signer.jar")

MANIFEST = os.path.join(BASE_DIR, "AndroidManifest.xml")
RES_DIR = os.path.join(BASE_DIR, "res")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")
SRC_DIR = os.path.join(BASE_DIR, "src")

WORK_DIR = os.path.join(BASE_DIR, "build")
GEN_DIR = os.path.join(WORK_DIR, "gen")
CLASSES_DIR = os.path.join(WORK_DIR, "classes")
DEX_DIR = os.path.join(WORK_DIR, "dex")
DIST_DIR = os.path.join(BASE_DIR, "dist")
OUTPUT_APK_FINAL = os.path.join(BASE_DIR, "OmniRC-Remote.apk")

def run():
    print("=" * 60)
    print("  OmniRC Android APK Build Pipeline")
    print("=" * 60)

    # 1. Clean and setup workspace
    if os.path.exists(WORK_DIR):
        shutil.rmtree(WORK_DIR)
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)

    os.makedirs(GEN_DIR, exist_ok=True)
    os.makedirs(CLASSES_DIR, exist_ok=True)
    os.makedirs(DEX_DIR, exist_ok=True)
    os.makedirs(DIST_DIR, exist_ok=True)

    # 2. AAPT2 Compile Resources
    print("\n[1/6] Compiling Android resources with AAPT2...")
    res_zip = os.path.join(WORK_DIR, "res.zip")
    cmd_compile = [AAPT2, "compile", "--dir", RES_DIR, "-o", res_zip]
    subprocess.run(cmd_compile, check=True)

    # 3. AAPT2 Link Resources & Assets
    print("\n[2/6] Linking resources, assets, and AndroidManifest.xml...")
    unaligned_apk = os.path.join(WORK_DIR, "unaligned.apk")
    cmd_link = [
        AAPT2, "link",
        "-I", ANDROID_JAR,
        "--manifest", MANIFEST,
        "-o", unaligned_apk,
        "--java", GEN_DIR,
        "--auto-add-overlay",
        "-A", ASSETS_DIR,
        res_zip
    ]
    subprocess.run(cmd_link, check=True)

    # 4. Java Compilation
    print("\n[3/6] Compiling Java source code with javac...")
    java_files = []
    for root, _, files in os.walk(SRC_DIR):
        for f in files:
            if f.endswith(".java"):
                java_files.append(os.path.join(root, f))
    for root, _, files in os.walk(GEN_DIR):
        for f in files:
            if f.endswith(".java"):
                java_files.append(os.path.join(root, f))

    cmd_javac = [
        "javac",
        "--release", "8",
        "-encoding", "UTF-8",
        "-cp", f"{ANDROID_JAR};{GEN_DIR}",
        "-d", CLASSES_DIR,
        *java_files
    ]
    subprocess.run(cmd_javac, check=True)

    # 5. D8 Dexing
    print("\n[4/6] Translating Java bytecode to Dalvik DEX (D8)...")
    class_files = []
    for root, _, files in os.walk(CLASSES_DIR):
        for f in files:
            if f.endswith(".class"):
                class_files.append(os.path.join(root, f))

    cmd_d8 = [
        "java", "-cp", R8_JAR,
        "com.android.tools.r8.D8",
        "--lib", ANDROID_JAR,
        "--min-api", "21",
        "--output", DEX_DIR,
        *class_files
    ]
    subprocess.run(cmd_d8, check=True)

    # 6. Add classes.dex into unaligned APK
    print("\n[5/6] Injecting classes.dex into APK archive...")
    dex_path = os.path.join(DEX_DIR, "classes.dex")
    with zipfile.ZipFile(unaligned_apk, "a") as z:
        z.write(dex_path, "classes.dex")

    # 7. ZipAlign & Sign with Uber-APK-Signer
    print("\n[6/6] ZipAligning and Signing APK (v1, v2, v3 schemes)...")
    cmd_sign = [
        "java", "-jar", UBER_SIGNER,
        "--apks", unaligned_apk,
        "-o", DIST_DIR,
        "--allowResign"
    ]
    subprocess.run(cmd_sign, check=True)

    # 8. Copy signed APK to final location
    signed_candidates = [f for f in os.listdir(DIST_DIR) if f.endswith("-aligned-debugSigned.apk")]
    if not signed_candidates:
        raise RuntimeError("No signed APK found in dist folder!")

    source_signed = os.path.join(DIST_DIR, signed_candidates[0])
    shutil.copyfile(source_signed, OUTPUT_APK_FINAL)

    # Calculate SHA256 and size
    size_bytes = os.path.getsize(OUTPUT_APK_FINAL)
    hasher = hashlib.sha256()
    with open(OUTPUT_APK_FINAL, "rb") as f:
        hasher.update(f.read())
    sha256_hash = hasher.hexdigest()

    print("\n" + "=" * 60)
    print("  BUILD SUCCESSFUL!")
    print("=" * 60)
    print(f"APK Path:   {OUTPUT_APK_FINAL}")
    print(f"File Size:  {size_bytes:,} bytes ({size_bytes / (1024*1024):.2f} MB)")
    print(f"SHA-256:    {sha256_hash}")
    print("=" * 60)

if __name__ == "__main__":
    run()
