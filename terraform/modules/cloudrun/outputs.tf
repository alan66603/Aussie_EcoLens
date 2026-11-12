output "inference_url" { value = google_cloud_run_v2_service.inference.uri }
output "frontend_url"  { value = google_cloud_run_v2_service.frontend.uri }
