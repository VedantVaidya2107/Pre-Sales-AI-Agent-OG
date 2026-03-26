import requests
import time
import sys

BASE_URL = "http://localhost:3001"

def test_endpoint(name, method, path, expected_status=200, json=None, params=None):
    try:
        if method == "GET":
            res = requests.get(f"{BASE_URL}{path}", params=params)
        elif method == "POST":
            res = requests.post(f"{BASE_URL}{path}", json=json)
        elif method == "DELETE":
            res = requests.delete(f"{BASE_URL}{path}")
            
        if res.status_code == expected_status:
            print(f"✅ {name} passed")
            return res.json()
        else:
            print(f"❌ {name} failed: Expected {expected_status}, got {res.status_code}. Response: {res.text}")
            return None
    except Exception as e:
        print(f"❌ {name} failed with exception: {e}")
        return None

def run_tests():
    # Wait for server to start
    for _ in range(5):
        try:
            if requests.get(f"{BASE_URL}/health").status_code == 200:
                print("✅ Server is up!")
                break
        except:
            time.sleep(1)
    else:
        print("❌ Server failed to start")
        sys.exit(1)

    # 1. Test Auth Check
    test_endpoint("Auth Check", "GET", "/api/auth/check", params={"email": "test@fristinetech.com"})
    
    # 2. Test Get Clients
    clients = test_endpoint("Get Clients", "GET", "/api/clients")
    
    # 3. Test Create Client
    new_client = test_endpoint("Create Client", "POST", "/api/clients", json={
        "company": "Test Corp",
        "email": "contact@testcorp.com",
        "industry": "Software"
    }, expected_status=201)
    
    if new_client:
        client_id = new_client.get("client_id")
        
        # 4. Test Get Client
        test_endpoint("Get Single Client", "GET", f"/api/clients/{client_id}")
        
        # 5. Test Tracking
        test_endpoint("Add Tracking Event", "POST", f"/api/tracking/{client_id}", json={
            "event": "conversation_started"
        })
        
        # 6. Test Get Tracking
        test_endpoint("Get Tracking Events", "GET", f"/api/tracking/{client_id}")
        
        # 7. Test Delete Client
        test_endpoint("Delete Client", "DELETE", f"/api/clients/{client_id}")
        
run_tests()
