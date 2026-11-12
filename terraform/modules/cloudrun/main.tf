data "google_artifact_registry_docker_image" "inference" {
  location      = var.gcp_region
  repository_id = "ecolens"
  image_name    = "inference:latest"
}

data "google_artifact_registry_docker_image" "frontend" {
  location      = var.gcp_region
  repository_id = "ecolens"
  image_name    = "frontend:latest"
}

resource "google_cloud_run_v2_service" "inference" {
  name     = "ecolens-inference"
  location = var.gcp_region

  template {
    service_account = var.inference_sa_email
    timeout         = "300s"

    containers {
      image = data.google_artifact_registry_docker_image.inference.self_link

      env {
        name  = "MODEL_BUCKET"
        value = var.ml_models_bucket_name
      }

      env {
        name  = "DETECTOR_VERSION"
        value = var.detector_version
      }

      env {
        name  = "CLASSIFIER_VERSION"
        value = var.classifier_version
      }

      resources {
        limits = {
          cpu    = "4"
          memory = "8Gi"
        }
        cpu_idle = false
      }
    }

    scaling {
      min_instance_count = 1
      max_instance_count = 5
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "inference_lambda_invoker" {
  project  = var.gcp_project_id
  location = var.gcp_region
  name     = google_cloud_run_v2_service.inference.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${var.lambda_caller_sa_email}"
}

resource "google_cloud_run_v2_service" "frontend" {
  name     = "ecolens-frontend"
  location = var.gcp_region

  template {
    containers {
      image = data.google_artifact_registry_docker_image.frontend.self_link

      env {
        name  = "API_GATEWAY_URL"
        value = var.api_gateway_url
      }
    }

    scaling {
      max_instance_count = 2
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  project  = var.gcp_project_id
  location = var.gcp_region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
