import requests

resp = requests.post(
    "http://localhost:8080/predict",
    json={
        # "file_url": "https://www.parks.vic.gov.au/-/media/project/pv/main/parks/images/news/world-wombat-day-2025/mother-and-joey-wombat.jpg?rev=823b5d4c0728426d8941b7dd664a9ae2",
        "file_url": "http://localhost:9090/Common Wombats - Cinematic Wildlife Footage.mp4",
        "file_type": "video"
    }
)
print(resp.json())