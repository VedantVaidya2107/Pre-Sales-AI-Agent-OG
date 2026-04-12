import subprocess
import re
import time
import os

def get_cloudflare_url():
    print("Starting cloudflared tunnel...")
    process = subprocess.Popen(
        ['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True
    )

    url_pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com')
    
    start_time = time.time()
    while time.time() - start_time < 30:  # Wait up to 30 seconds
        line = process.stdout.readline()
        if not line:
            break
        print(line.strip())
        match = url_pattern.search(line)
        if match:
            url = match.group(0)
            print(f"\nFOUND TUNNEL URL: {url}")
            # Keep process running in background but return URL
            return url
    
    return None

if __name__ == "__main__":
    url = get_cloudflare_url()
    if url:
        with open("new_tunnel_url.txt", "w") as f:
            f.write(url)
        print(f"URL saved to new_tunnel_url.txt: {url}")
    else:
        print("Failed to find tunnel URL.")
