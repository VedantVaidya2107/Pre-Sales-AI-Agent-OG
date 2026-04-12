"""Quick script to find the active cloudflare tunnel URL by querying localhost"""
import subprocess
import re
import sys

# Run cloudflared with a timeout to capture the URL
result = subprocess.run(
    ['npx', 'cloudflared', 'tunnel', '--url', 'http://localhost:8000'],
    capture_output=True, text=True, timeout=45,
    shell=True
)

output = result.stdout + result.stderr
match = re.search(r'(https://[a-z0-9-]+\.trycloudflare\.com)', output)
if match:
    url = match.group(1)
    print(f"FOUND: {url}")
    with open("tunnel_url.txt", "w") as f:
        f.write(url)
else:
    print("No URL found in output:")
    print(output[:2000])
