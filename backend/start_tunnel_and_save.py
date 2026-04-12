import subprocess
import re
import time
import os
import signal

def find_url():
    cmd = ['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000']
    print(f"Running: {' '.join(cmd)}")
    
    # Use Popen to capture output in real-time
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
        shell=True  # Use shell=True for npx on Windows
    )

    url_file = "active_tunnel_url.txt"
    url_found = False
    
    start_time = time.time()
    try:
        while time.time() - start_time < 60: # Wait up to 60 seconds
            line = process.stdout.readline()
            if not line:
                break
            
            print(line.strip())
            
            # Simple regex for the Cloudflare URL
            match = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
            if match:
                url = match.group(0)
                print(f"\n[SUCCESS] Captured URL: {url}")
                with open(url_file, "w") as f:
                    f.write(url)
                url_found = True
                # We found it! Now we just let it keep running in the background.
                # But we should break the loop to finish the script while the process remains.
                return url
                
    except Exception as e:
        print(f"[ERROR] {e}")
    finally:
        if not url_found:
             print("[FAILED] Could not find URL in 60 seconds.")
    
    return None

if __name__ == "__main__":
    find_url()
