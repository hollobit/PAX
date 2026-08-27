import requests
def get_data(q):
    return requests.get("https://api.data.go.kr", params={"q": q}).json()
