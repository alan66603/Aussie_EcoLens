import { useEffect, useState } from "react";
import "./App.css";
import {
  clearAuthTokens,
  getAuthorizationHeader,
  getTokenTimeRemainingText,
  getUserProfile,
  isAuthenticated,
  logoutFromCognito,
  parseCallbackTokens,
  redirectToCognito,
} from "./auth";
import { API_URL, USE_MOCK } from "./config";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(
    USE_MOCK
      ? localStorage.getItem("mockToken") === "true"
      : isAuthenticated()
  );
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [authError, setAuthError] = useState("");
  const [selectedTagItems, setSelectedTagItems] = useState([]);
  const [deleteUrls, setDeleteUrls] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      refreshAvailableTags();
    }
  }, [isLoggedIn]);

  //useEffect(() => {
  //  setSelectedTagItems([]);
  //}, [currentPage]);

  function goToDelete(items) {
    setDeleteUrls(items.map((item) => getCopyableFileUrl(item)).filter(Boolean));
    setCurrentPage("delete");
  }

  async function refreshAvailableTags() {
    try {
      setIsLoadingTags(true);

      const response = await fetch(`${API_URL}/tags`, {
        method: "GET",
        headers: {
          Authorization: getAuthorizationHeader(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to load tags.");
      }

      const backendTags = Array.isArray(data.tags)
        ? data.tags.map((tag) => normaliseTagInput(tag)).filter(Boolean)
        : [];

      setAvailableTags([...new Set(backendTags)].sort());
    } catch (error) {
      console.error(error);
      setAvailableTags([]);
    } finally {
      setIsLoadingTags(false);
    }
  }

  const [userProfile, setUserProfile] = useState(
    USE_MOCK
      ? {
          name: "Demo User",
          email: "demo@ecolens.app",
          initials: "DU",
        }
      : getUserProfile()
  );

  const [sessionStatus, setSessionStatus] = useState(
    USE_MOCK ? "Mock session" : getTokenTimeRemainingText()
  );

  useEffect(() => {
    async function handleCallback() {
      if (USE_MOCK) {
        return;
      }

      if (window.location.pathname === "/callback") {
        try {
          const tokens = await parseCallbackTokens();

          if (tokens) {
            window.history.replaceState({}, document.title, "/");
            setUserProfile(getUserProfile());
            setSessionStatus(getTokenTimeRemainingText());
            setIsLoggedIn(true);
            setCurrentPage("dashboard");
          }
        } catch (error) {
          console.error(error);
          setAuthError(error.message || "Authentication failed.");
          window.history.replaceState({}, document.title, "/");
        }
      }
    }

    handleCallback();
  }, []);

  useEffect(() => {
    if (USE_MOCK || !isLoggedIn) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!isAuthenticated()) {
        clearAuthTokens();
        setIsLoggedIn(false);
        setUserProfile(null);
        setSessionStatus("Session expired");
        return;
      }

      setUserProfile(getUserProfile());
      setSessionStatus(getTokenTimeRemainingText());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, [isLoggedIn]);

  async function handleAuthRedirect(mode) {
    setAuthError("");

    if (USE_MOCK) {
      localStorage.setItem("mockToken", "true");
      setUserProfile({
        name: "Demo User",
        email: "demo@ecolens.app",
        initials: "DU",
      });
      setSessionStatus("Mock session");
      setIsLoggedIn(true);
      setCurrentPage("dashboard");
      return;
    }

    try {
      await redirectToCognito(mode);
    } catch (error) {
      console.error(error);
      setAuthError(error.message || "Unable to start Cognito login.");
    }
  }

  function handleLogout() {
    if (USE_MOCK) {
      localStorage.removeItem("mockToken");
      setIsLoggedIn(false);
      setUserProfile(null);
      setSessionStatus("");
      return;
    }

    clearAuthTokens();
    setIsLoggedIn(false);
    setUserProfile(null);
    setSessionStatus("");
    logoutFromCognito();
  }

  if (!isLoggedIn) {
    return (
      <div className="page login-page">
        <div className="login-card">
          <div className="brand">
            <div className="brand-mark">AE</div>
            <h1>Aussie EcoLens</h1>
            <p>
              AI-powered wildlife intelligence across cloud-native media
              pipelines
            </p>
          </div>

          <div className="auth-actions clean-auth-actions">
            <button
              type="button"
              className="auth-main-button"
              onClick={() => handleAuthRedirect("signin")}
            >
              Sign in
            </button>

            <button
              type="button"
              className="auth-outline-button"
              onClick={() => handleAuthRedirect("signup")}
            >
              Sign up
            </button>
          </div>

          {authError && <p className="auth-error">{authError}</p>}

          <p className="hint auth-hint">
            Authentication is securely handled by AWS Cognito. After login, the
            Cognito ID token is used to access protected API Gateway endpoints.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">AE</div>
          <div>
            <h2>EcoLens</h2>
            <span>Cloud Wildlife AI</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={currentPage === "dashboard" ? "active" : ""}
            onClick={() => setCurrentPage("dashboard")}
          >
            <span>Overview</span>
            <small>System dashboard</small>
          </button>

          <button
            className={currentPage === "upload" ? "active" : ""}
            onClick={() => setCurrentPage("upload")}
          >
            <span>Upload Media</span>
            <small>Images and videos</small>
          </button>

          <button
            className={currentPage === "mine" ? "active" : ""}
            onClick={() => setCurrentPage("mine")}
          >
            <span>Mine</span>
            <small>My uploads</small>
          </button>

          <button
            className={currentPage === "browse" ? "active" : ""}
            onClick={() => setCurrentPage("browse")}
          >
            <span>Browse All</span>
            <small>All uploaded media</small>
          </button>

          <button
            className={currentPage === "query" ? "active" : ""}
            onClick={() => setCurrentPage("query")}
          >
            <span>Query Files</span>
            <small>Tags and thumbnails</small>
          </button>

          <button
            className={currentPage === "tags" ? "active" : ""}
            onClick={() => setCurrentPage("tags")}
          >
            <span>Manage Tags</span>
            <small>Bulk metadata edit</small>
          </button>

          <button
            className={currentPage === "delete" ? "active" : ""}
            onClick={() => setCurrentPage("delete")}
          >
            <span>Delete Files</span>
            <small>Storage and database</small>
          </button>

          <button
            className={currentPage === "notify" ? "active" : ""}
            onClick={() => setCurrentPage("notify")}
          >
            <span>Notifications</span>
            <small>Watched species alerts</small>
          </button>

        </nav>

        <button className="logout-button" onClick={handleLogout}>
          Sign Out
        </button>
      </aside>

      <main className="main-content">
        <TopUserBar userProfile={userProfile} sessionStatus={sessionStatus} />

        {currentPage === "dashboard" && <DashboardPage />}
        {currentPage === "upload" && (<UploadPage refreshAvailableTags={refreshAvailableTags} />)}
        {currentPage === "mine" && (
          <MinePage
            selectedTagItems={selectedTagItems}
            setSelectedTagItems={setSelectedTagItems}
            goToManageTags={() => setCurrentPage("tags")}
            goToDelete={goToDelete}
          />
        )}

        {currentPage === "query" && (
          <QueryPage
            selectedTagItems={selectedTagItems}
            setSelectedTagItems={setSelectedTagItems}
            goToManageTags={() => setCurrentPage("tags")}
            availableTags={availableTags}
            isLoadingTags={isLoadingTags}
          />
        )}

        {currentPage === "tags" && (
          <TagManagementPage
            selectedTagItems={selectedTagItems}
            setSelectedTagItems={setSelectedTagItems}
            clearSelectedTagItems={() => setSelectedTagItems([])}
            availableTags={availableTags}
            isLoadingTags={isLoadingTags}
            refreshAvailableTags={refreshAvailableTags}
          />
        )}

        {currentPage === "delete" && <DeletePage initialUrls={deleteUrls} onMounted={() => setDeleteUrls([])} />}
        {currentPage === "notify" && <NotificationPage availableTags={availableTags} isLoadingTags={isLoadingTags}/>}
        {currentPage === "browse" && (
          <BrowseAllPage
            selectedTagItems={selectedTagItems}
            setSelectedTagItems={setSelectedTagItems}
            goToManageTags={() => setCurrentPage("tags")}
          />
        )}
      </main>
    </div>
  );
}

function TopUserBar({ userProfile, sessionStatus }) {
  if (!userProfile) {
    return null;
  }

  const displayName = userProfile.name || "User";
  const displayEmail = userProfile.email || "Authenticated user";

  return (
    <div className="account-box-wrapper">
      <div className="account-box" title={displayEmail}>
        <div className="account-name">{displayName}</div>
        <div className="account-email">{displayEmail}</div>
        <div className="account-session">{sessionStatus}</div>
      </div>
    </div>
  );
}

function DashboardPage() {
  return (
    <section>
      <div className="eyebrow">Cloud-native wildlife intelligence</div>

      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            Upload wildlife media, automatically detect species, search by tag
            counts, manage metadata, delete files, and subscribe to
            tag-specific notifications.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Protected APIs</span>
          <strong>16</strong>
          <p>Upload, query, tags, delete, and notification endpoints</p>
        </div>

        <div className="metric-card">
          <span>Supported Media</span>
          <strong>2</strong>
          <p>Images and videos with thumbnail or frame processing</p>
        </div>

        <div className="metric-card">
          <span>Cloud Providers</span>
          <strong>2</strong>
          <p>AWS for API and storage, GCP for frontend and inference</p>
        </div>
      </div>

      <div className="card-grid">
        <div className="info-card">
          <div className="card-icon">↑</div>
          <h3>Upload Pipeline</h3>
          <p>
            Upload images or videos with checksum-based duplicate prevention,
            thumbnail processing, and automatic ML species tagging.
          </p>
        </div>

        <div className="info-card">
          <div className="card-icon">⌕</div>
          <h3>Intelligent Search</h3>
          <p>
            Search by species, minimum tag counts, thumbnail URL, or a temporary
            uploaded query file.
          </p>
        </div>

        <div className="info-card">
          <div className="card-icon">✦</div>
          <h3>Metadata Control</h3>
          <p>
            Add or remove tags in bulk, delete media and thumbnails, and manage
            tag-based email notifications.
          </p>
        </div>
      </div>
    </section>
  );
}

function UploadPage({ refreshAvailableTags }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [processedUploadItem, setProcessedUploadItem] = useState(null);

  function handleFileChange(event) {
    const file = event.target.files[0];
    setSelectedFile(file || null);
    setUploadResult(null);
    setProcessedUploadItem(null);
  }

  async function handleUpload(event) {
    event.preventDefault();
    setUploadResult(null);
    setProcessedUploadItem(null);

    if (!selectedFile) {
      setUploadResult({
        type: "error",
        message: "Please select a .jpg, .jpeg, .png image or .mp4 video first.",
      });
      return;
    }

    const validation = getUploadFileType(selectedFile);

    if (!validation.ok) {
      setUploadResult({
        type: "error",
        message: validation.error,
      });
      return;
    }

    const sizeValidation = validateMaxFileSize(selectedFile);

    if (!sizeValidation.ok) {
      setUploadResult({
        type: "error",
        message: sizeValidation.error,
      });
      return;
    }



    try {
      setUploadResult({
        type: "success",
        message: "Calculating file checksum...",
      });

      const checksum = await calculateSha256(selectedFile);

      setUploadResult({
        type: "success",
        message: "Requesting secure upload URL...",
      });

      const authorizationHeader = getAuthorizationHeader();

      if (!authorizationHeader) {
        setUploadResult({
          type: "error",
          message: "Your session has expired. Please sign in again.",
        });
        return;
      }

      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorizationHeader,
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: validation.contentType,
          checksum,
        }),
      });

      const data = await response.json();

      if (response.status === 409) {
        setUploadResult({
          type: "warning",
          message: data.error || "File already exists.",
          details: [
            "Duplicate detected by checksum.",
            "The file was not uploaded again.",
          ],
        });
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error || data.message || "Failed to get presigned upload URL."
        );
      }

      if (!data.presigned_url || !data.file_id) {
        throw new Error(
          "Upload API response must include presigned_url and file_id."
        );
      }

      setUploadResult({
        type: "success",
        message: "Uploading file to S3...",
        details: [`File ID: ${data.file_id}`],
      });

      await uploadFileToPresignedUrl(
        data.presigned_url,
        selectedFile,
        validation.contentType
      );

      setUploadResult({
        type: "success",
        message: "File uploaded. Running inference, please wait a minute...",
        details: [
          `File ID: ${data.file_id}`,
          `Checksum: ${checksum.slice(0, 12)}...${checksum.slice(-8)}`,
          `Content-Type: ${validation.contentType}`,
          "The file was uploaded directly to S3 using a presigned URL.",
        ],
      });

      const processedItem = await pollShowProcess(data.file_id);

      setProcessedUploadItem(processedItem);

      if (refreshAvailableTags) {
        await refreshAvailableTags();
      }

      setUploadResult({
        type: "success",
        message: "Upload and inference completed successfully.",
        details: [
          `File ID: ${data.file_id}`,
          "Detected tags are shown in the processed result card below.",
          "The species tag list has been refreshed for query suggestions.",
        ],
      });
    } catch (error) {
      console.error(error);

      setUploadResult({
        type: "error",
        message: error.message || "Upload failed.",
      });
    }
  }

  return (
    <section>
      <div className="eyebrow">Auth & Upload UI</div>
      <h1>Upload Media</h1>
      <p>
        Upload a .jpg, .jpeg, .png image or .mp4 video. The frontend calculates 
        a SHA-256 checksum, requests a secure presigned upload URL, and uploads 
        the file directly to S3.
      </p>

      <form className="panel" onSubmit={handleUpload}>
        <label>Select .jpg, .jpeg, .png image or .mp4 video</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.mp4,image/jpeg,image/png,video/mp4"
          onChange={handleFileChange}
        />

        {selectedFile && (
          <div className="file-summary">
            <p>
              <strong>Selected file:</strong> {selectedFile.name}
            </p>
            <p>
              <strong>Type:</strong> {selectedFile.type || "unknown"}
            </p>
            <p>
              <strong>Size:</strong>{" "}
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}

        <button type="submit">Upload and Process</button>

        {uploadResult && (
          <div className={`status-box ${uploadResult.type}`}>
            <h3>{uploadResult.message}</h3>

            {uploadResult.details && (
              <ul>
                {uploadResult.details.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="hint">
          Supported formats: .jpg and .jpeg with image/jpeg, .png with image/png, and
          .mp4 with video/mp4. Maximum file size is 50 MB. Duplicate files are detected
          by checksum before upload.
        </p>
      </form>

      {processedUploadItem && (
        <div className="upload-result-section">
          <div className="eyebrow">Processed Result</div>
          <h2>Uploaded Media Result</h2>
          <UploadProcessedCard item={processedUploadItem} />
        </div>
      )}
    </section>
  );
}

function UploadProcessedCard({ item }) {
  const displayUrl = getDisplayUrl(item);
  const fullMediaUrl = getFullMediaUrl(item);
  const copyableFileUrl = getCopyableFileUrl(item);
  const copyableThumbnailUrl = getCopyableThumbnailUrl(item);
  const [copyMessage, setCopyMessage] = useState("");

  return (
    <div className="upload-result-card">
      <div className="upload-result-preview">
        {item.file_type === "image" ? (
          <a href={fullMediaUrl} target="_blank" rel="noreferrer">
            <img src={displayUrl} alt="Uploaded media thumbnail" />
          </a>
        ) : item.file_type === "video" ? (
          <video src={fullMediaUrl} controls muted preload="metadata" style={{ width: "100%", aspectRatio: "16/9", display: "block" }} />
        ) : (
          <div className="video-box">No Preview</div>
        )}
      </div>

      <div className="upload-result-content">
        <div className="result-meta-row">
          <span>{String(item.file_type || "file").toUpperCase()}</span>
          <small>Processed upload result</small>
        </div>

        <h3>Inference completed</h3>

        {item.file_id && (
          <p className="hint">
            <strong>File ID:</strong> {item.file_id}
          </p>
        )}

        {item.tags && Object.keys(item.tags).length > 0 ? (
          <div className="badge-row">
            {Object.entries(item.tags).map(([tag, count]) => (
              <span className="badge" key={tag}>
                {tag} × {count}
              </span>
            ))}
          </div>
        ) : (
          <p className="hint">No species tags were detected.</p>
        )}

        <div className="upload-result-actions">
          {fullMediaUrl && (
            <a
              className="preview-link"
              href={fullMediaUrl}
              target="_blank"
              rel="noreferrer"
            >
              {item.file_type === "video" ? "Open full video" : "Open full image"}
            </a>
          )}

          {copyableFileUrl && (
            <button
              type="button"
              className="secondary-button copy-url-button"
              onClick={async () => {
                await navigator.clipboard.writeText(copyableFileUrl);
                setCopyMessage("File URL copied. You can paste it into Delete Files.");
              }}
            >
              Copy file URL for delete
            </button>
          )}

          {copyableThumbnailUrl && (
            <button
              type="button"
              className="secondary-button copy-url-button"
              onClick={async () => {
                await navigator.clipboard.writeText(copyableThumbnailUrl);
                setCopyMessage(
                  "Actual thumbnail URL copied. You can paste it into Thumbnail URL search."
                );
              }}
            >
              Copy actual thumbnail URL
            </button>
          )}
        </div>

        {copyMessage && <p className="success-message">{copyMessage}</p>}
      </div>
    </div>
  );
}

function getUploadFileType(file) {
  const filename = String(file.name || "").toLowerCase();
  const contentType = file.type;

  const isJpg =
    filename.endsWith(".jpg") && contentType === "image/jpeg";

  const isJpeg =
    filename.endsWith(".jpeg") && contentType === "image/jpeg";

  const isPng =
    filename.endsWith(".png") && contentType === "image/png";

  const isMp4 =
    filename.endsWith(".mp4") && contentType === "video/mp4";

  if (isJpg || isJpeg || isPng || isMp4) {
    return {
      ok: true,
      contentType,
      fileType: isMp4 ? "video" : "image",
    };
  }

  return {
    ok: false,
    error:
      "Only .jpg, .jpeg, .png images and .mp4 videos are supported.",
  };
}

const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024;

function formatFileSize(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function validateMaxFileSize(file) {
  if (file.size > MAX_MEDIA_FILE_BYTES) {
    return {
      ok: false,
      error: `File size must be 50 MB or smaller. Current size: ${formatFileSize(
        file.size
      )}.`,
    };
  }

  return {
    ok: true,
    error: "",
  };
}

async function calculateSha256(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  return hashArray
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadFileToPresignedUrl(presignedUrl, file, contentType) {
  const response = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error("Failed to upload file to S3 using the presigned URL.");
  }
}


function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function normaliseShowProcessResponse(data, fileId) {
  const candidate =
    data.result ||
    data.item ||
    data.file ||
    data.record ||
    data.media ||
    data;

  return normaliseResultItem(
    {
      ...candidate,
      file_id: candidate.file_id || fileId,
    },
    0
  );
}

async function pollShowProcess(fileId) {
  const maxAttempts = 40;
  const intervalMs = 3000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(
      `${API_URL}/show_process?file_id=${encodeURIComponent(fileId)}`,
      {
        method: "GET",
        headers: {
          Authorization: getAuthorizationHeader(),
        },
      }
    );

    if (response.status === 200) {
      const data = await response.json();
      const item = normaliseShowProcessResponse(data, fileId);

      if (!item) {
        throw new Error("show_process returned 200 but no valid media item.");
      }

      return item;
    }

    if ([202, 204, 404].includes(response.status)) {
      await sleep(intervalMs);
      continue;
    }

    let errorMessage = "Failed to check upload processing status.";

    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Keep default error message.
    }

    throw new Error(errorMessage);
  }

  throw new Error(
    "Upload completed, but inference is still processing. Please check Browse All later."
  );
}

function QueryPage({
  selectedTagItems,
  setSelectedTagItems,
  goToManageTags,
  availableTags,
  isLoadingTags,
}) {
  const [queryType, setQueryType] = useState("tags");
  const [results, setResults] = useState([]);
  const [queryMessage, setQueryMessage] = useState("");
  const [queryTagRows, setQueryTagRows] = useState([createEmptyQueryTagRow()]);
  const [speciesInput, setSpeciesInput] = useState("");

  function normaliseQueryResults(data) {
    if (Array.isArray(data.results)) {
      return data.results
        .map((item, index) => normaliseResultItem(item, index))
        .filter((item) => item && item.display_url);
    }

    if (data.file_id || data.display_url || data.url) {
      const singleItem = normaliseResultItem(data, 0);
      return singleItem && singleItem.display_url ? [singleItem] : [];
    }

    return [];
  }

  function updateQueryTagRow(rowId, field, value) {
    setQueryTagRows(
      queryTagRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: value,
            }
          : row
      )
    );
  }

  function addQueryTagRow() {
    setQueryTagRows([...queryTagRows, createEmptyQueryTagRow()]);
  }

  function removeQueryTagRow(rowId) {
    if (queryTagRows.length === 1) {
      setQueryTagRows([createEmptyQueryTagRow()]);
      return;
    }

    setQueryTagRows(queryTagRows.filter((row) => row.id !== rowId));
  }

  async function handleSearch(event) {
    event.preventDefault();
    setQueryMessage("");

    const formData = new FormData(event.currentTarget);

    try {
      let endpoint = "";
      let body = {};

      if (queryType === "tags") {
        endpoint = "/query/tags";

        const parsedQuery = validateQueryTagRows(queryTagRows, availableTags);

        if (!parsedQuery.ok) {
          setQueryMessage(parsedQuery.error);
          return;
        }

        body = parsedQuery.body;
      }

      if (queryType === "species") {
        endpoint = "/query/species";

        const species = normaliseTagInput(speciesInput);

        if (!species) {
          setQueryMessage("Please enter a species name.");
          return;
        }

        if (!TAG_INPUT_PATTERN.test(species)) {
          setQueryMessage(
            "Invalid species name. Use letters, spaces, hyphens or underscores only, for example domestic dog, red fox, common wombat, or koala."
          );
          return;
        }

        if (!isExistingTag(species, availableTags)) {
          setQueryMessage(
            `"${species}" is not in the current tag list. Please choose an existing tag from the suggestions.`
          );
          return;
        }

        body = { species };
      }

      

      if (queryType === "thumbnail") {
        endpoint = "/query/thumbnail";

        const thumbnailUrl = formData.get("thumbnailUrl")?.trim();

        if (!thumbnailUrl) {
          setQueryMessage("Please enter a thumbnail URL.");
          return;
        }

        body = { thumbnail_url: thumbnailUrl };
      }

      if (queryType === "file") {
        const queryFile = formData.get("queryFile");

        if (!queryFile || queryFile.size === 0) {
          setQueryMessage("Please select a query image or video file.");
          return;
        }

        const sizeValidation = validateMaxFileSize(queryFile);

        if (!sizeValidation.ok) {
          setQueryMessage(sizeValidation.error);
          return;
        }

        const queryFileValidation = getUploadFileType(queryFile);

        if (!queryFileValidation.ok) {
          setQueryMessage(queryFileValidation.error);
          return;
        }

        const fileType = queryFileValidation.fileType;

        setQueryMessage("Preparing temporary query upload...");

        const initResponse = await fetch(`${API_URL}/query/file/init`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: getAuthorizationHeader(),
          },
          body: JSON.stringify({
            filename: queryFile.name,
            file_type: fileType,
            content_type: queryFileValidation.contentType,
          }),
        });

        const initData = await initResponse.json();

        if (!initResponse.ok) {
          throw new Error(
            initData.message || "Unable to initialise query file upload."
          );
        }

        const uploadUrl =
          initData.upload_url || initData.presigned_url || initData.url || "";
        const s3Key = initData.s3_key || initData.key || "";
        const backendFileType = initData.file_type || fileType;

        if (!uploadUrl || !s3Key) {
          throw new Error(
            "Query file init response must include upload_url and s3_key."
          );
        }

        setQueryMessage("Uploading temporary query file...");

        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": queryFileValidation.contentType,
          },
          body: queryFile,
        });

        if (!uploadResponse.ok) {
          throw new Error("Temporary query file upload failed.");
        }

        setQueryMessage(
          "Running inference on the query file. Please wait a minute..."
        );

        endpoint = "/query/file";
        body = {
          s3_key: s3Key,
          file_type: backendFileType,
        };
      }

      if (queryType === "file") {
        setQueryMessage("Running inference on the query file. Please wait a minute...");
      } else {
        setQueryMessage("Searching shared media library...");
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthorizationHeader(),
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Query failed.");
      }

      const normalised = normaliseQueryResults(data);
      setResults(normalised);
      setSelectedTagItems([]);

      setQueryMessage(
        normalised.length > 0
          ? `${normalised.length} matching file(s) found.`
          : "No matching files found."
      );
    } catch (error) {
      console.error(error);
      setQueryMessage(error.message || "Query failed.");
    }
  }

  return (
    <section>
      <div className="eyebrow">Complex Query UI</div>
      <h1>Query Files</h1>
      <p>
        Search the shared wildlife media library by tag counts, species,
        thumbnail URL, or a temporary query file. Select results and send them
        to Manage Tags for bulk tag editing.
      </p>

      <div className="tabs">
        <button
          type="button"
          className={queryType === "tags" ? "active" : ""}
          onClick={() => setQueryType("tags")}
        >
          Tags with Counts
        </button>

        <button
          type="button"
          className={queryType === "species" ? "active" : ""}
          onClick={() => setQueryType("species")}
        >
          Species
        </button>

        <button
          type="button"
          className={queryType === "thumbnail" ? "active" : ""}
          onClick={() => setQueryType("thumbnail")}
        >
          Thumbnail URL
        </button>

        <button
          type="button"
          className={queryType === "file" ? "active" : ""}
          onClick={() => setQueryType("file")}
        >
          Query by File
        </button>
      </div>

      <form className="panel" onSubmit={handleSearch}>
        {queryType === "tags" && (
          <div className="query-tag-editor">

            <div className="query-tag-editor-header">
              <span>Species tag</span>
              <span>Minimum count</span>
              <span>Action</span>
            </div>

            {queryTagRows.map((row) => (
              <div className="query-tag-row" key={row.id}>
              <SpeciesAutocomplete
                value={row.name}
                onChange={(value) => updateQueryTagRow(row.id, "name", value)}
                options={availableTags}
                placeholder={isLoadingTags ? "Loading tags..." : "Type or select existing tag"}
              />

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={row.count}
                  onChange={(event) =>
                    updateQueryTagRow(row.id, "count", event.target.value)
                  }
                  placeholder="1"
                />

                <button
                  type="button"
                  className="secondary-button query-row-remove-button"
                  onClick={() => removeQueryTagRow(row.id)}
                >
                  Remove row
                </button>
              </div>
            ))}

            <button
              type="button"
              className="secondary-button add-query-tag-button"
              onClick={addQueryTagRow}
            >
              + Add query tag
            </button>

            <p className="hint">
              This query uses AND logic. You can search by species tag names such as
              domestic dog, red fox, common wombat, or koala. Tag names can contain letters,
              spaces, hyphens, or underscores.
            </p>
          </div>
        )}

        {queryType === "species" && (
          <>
            <label>Species name</label>
            <SpeciesAutocomplete
              value={speciesInput}
              onChange={setSpeciesInput}
              options={availableTags}
              placeholder={isLoadingTags ? "Loading tags..." : "Type or select existing tag"}
            />
            <p className="hint">
              Start typing a keyword and choose a full species name from the suggestion list.
              Selecting the full name gives the most accurate result.
            </p>
          </>
        )}

        {queryType === "thumbnail" && (
          <>
            <label>Thumbnail URL</label>
            <input
              name="thumbnailUrl"
              type="text"
              placeholder="Paste thumbnail URL here"
            />
            <p className="hint">
              Thumbnail URL search is for images only. Paste an image thumbnail URL to get
              the corresponding full-size image URL.
            </p>
          </>
        )}

        {queryType === "file" && (
          <>
            <label>Upload query file</label>
            <input name="queryFile" type="file" accept=".jpg,.jpeg,.png,.mp4,image/jpeg,image/png,video/mp4" />
            <p className="hint">
              Upload a .jpg, .jpeg, .png image or .mp4 video up to 50 MB. The selected file is 
              uploaded to temporary S3 storage through a presigned URL, used only for inference 
              and matching, then deleted by the backend. It is not added to the media database
              or permanently stored.
            </p>
          </>
        )}

        <button type="submit">Search Media</button>

        <MessageBox message={queryMessage} />
      </form>

      <ResultList
        results={results}
        selectedTagItems={selectedTagItems}
        setSelectedTagItems={setSelectedTagItems}
        goToManageTags={goToManageTags}
      />
    </section>
  );
}


function normaliseResultItem(item, index) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const fileType = item.file_type || inferFileType(item.file_url || item.display_url || "");

  const displayUrl =
    item.display_url ||
    item.presigned_url ||
    item.url ||
    item.thumbnail_presigned_url ||
    item.file_presigned_url ||
    (fileType === "image" ? item.thumbnail_url || item.file_url : item.file_url) ||
    "";

  if (!displayUrl) {
    return null;
  }



  return {
    id: item.file_id || displayUrl || index,
    file_id: item.file_id || "",
    display_url: displayUrl,
    file_type: fileType,

    // Presigned URL for opening full media
    file_url: item.file_url || item.presigned_url || item.original_url || "",

    // Actual/plain S3 URL for copy/delete
    actual_file_url: item.actual_file_url || item.delete_url || item.original_url || "",

    // Actual/plain thumbnail URL for thumbnail query
    thumbnail_url: item.thumbnail_url || "",

    // Presigned thumbnail URL for preview if backend provides it
    thumbnail_presigned_url: item.thumbnail_presigned_url || "",

    tags: item.tags || {},

    // Permission fields
    owner: item.owner || "",
    isPersonal: item.isPersonal ?? true,
    can_edit: item.can_edit ?? false,
    is_mine: item.is_mine ?? ((item.can_edit ?? false) && (item.isPersonal ?? true)),
  };
}

function getPermissionChipText(item) {
  if (item.is_mine) {
    return "Mine";
  }

  if (item.isPersonal) {
    return "Private · view only";
  }

  return "Public · editable";
}

function getPermissionDescription(item) {
  if (item.is_mine) {
    return "Your upload";
  }

  if (item.isPersonal) {
    return "View only";
  }

  return "Public editable";
}

function inferFileType(url = "") {
  if (/\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(url)) {
    return "video";
  }

  return "image";
}

function getDisplayUrl(item) {
  return item.display_url || "";
}

function getFullMediaUrl(item) {
  return item.file_url || item.original_url || item.display_url || "";
}

function getDisplayName(item, index) {
  const url = getDisplayUrl(item);

  if (!url) {
    return `Selected media ${index + 1}`;
  }

  try {
    const parsedUrl = new URL(url);
    const filename = parsedUrl.pathname.split("/").filter(Boolean).pop();

    if (filename) {
      return filename;
    }
  } catch {
    // Use fallback below.
  }

  return `Selected media ${index + 1}`;
}

function getCopyableFileUrl(item) {
  if (item.actual_file_url) {
    return getActualS3Url(item.actual_file_url);
  }

  if (item.file_url) {
    return getActualS3Url(item.file_url);
  }

  if (item.file_type === "video" && item.display_url) {
    return getActualS3Url(item.display_url);
  }

  return "";
}


function getActualS3Url(url) {
  const rawUrl = String(url || "").trim();

  if (!rawUrl) {
    return "";
  }

  try {
    const parsedUrl = new URL(rawUrl);
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString();
  } catch {
    return rawUrl.split("?")[0].split("#")[0];
  }
}

function getCopyableThumbnailUrl(item) {
  if (item.file_type !== "image") {
    return "";
  }

  const thumbnailUrl =
    item.thumbnail_url ||
    item.thumbnail_presigned_url ||
    item.display_url ||
    "";

  return getActualS3Url(thumbnailUrl);
}

function isErrorMessage(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("failed") ||
    text.includes("error") ||
    text.includes("invalid") ||
    text.includes("please") ||
    text.includes("missing") ||
    text.includes("not found") ||
    text.includes("unable") ||
    text.includes("must") ||
    text.includes("cannot")
  );
}

function MessageBox({ message, type }) {
  if (!message) {
    return null;
  }

  const cls = type || (isErrorMessage(message) ? "error" : "success");

  return (
    <div className={`status-box ${cls}`}>
      <h3>{message}</h3>
    </div>
  );
}

const TAG_INPUT_PATTERN = /^[a-zA-Z _-]+$/;
const TAG_MAX_LENGTH = 30;

function validateTagFormat(tagName, label = "Tag name") {
  const cleanTag = normaliseTagInput(tagName);

  if (!cleanTag) {
    return {
      ok: false,
      error: `${label} cannot be empty.`,
    };
  }

  if (cleanTag.length > TAG_MAX_LENGTH) {
    return {
      ok: false,
      error: `${label} must be ${TAG_MAX_LENGTH} characters or fewer.`,
    };
  }

  if (!TAG_INPUT_PATTERN.test(cleanTag)) {
    return {
      ok: false,
      error: `${label} can only contain English letters, spaces, hyphens, or underscores.`,
    };
  }

  return {
    ok: true,
    error: "",
  };
}

function isExistingTag(tagName, availableTags = []) {
  const cleanTag = normaliseTagInput(tagName);

  return availableTags.some(
    (tag) => normaliseTagInput(tag) === cleanTag
  );
}


function SpeciesAutocomplete({
  value,
  onChange,
  options = [],
  placeholder = "Type or select tag",
  disabled = false,
}) {
  const [isOpen, setIsOpen] = useState(false);

  const cleanValue = normaliseTagInput(value);

  const suggestions = options
    .filter((tag) => normaliseTagInput(tag).includes(cleanValue))
    .slice(0, 8);

  function handleSelect(tag) {
    onChange(tag);
    setIsOpen(false);
  }

  return (
    <div className="species-autocomplete">
      <input
        type="text"
        value={value}
        maxLength={TAG_MAX_LENGTH}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => {
          if (disabled) {
            return;
          }
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true)}
        }}
          
        onBlur={() => {
          window.setTimeout(() => setIsOpen(false), 120);
        }}
      />

      {!disabled && isOpen && cleanValue && suggestions.length > 0 && (
        <div className="species-suggestion-list">
          {suggestions.map((tag) => (
            <button
              type="button"
              className="species-suggestion-item"
              key={tag}
              onMouseDown={() => handleSelect(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function normaliseTagInput(value) {
  return String(value || "").trim().toLowerCase();
}

function createEmptyQueryTagRow() {
  return {
    id: `query-tag-${Date.now()}-${Math.random()}`,
    name: "",
    count: "1",
  };
}

function validateQueryTagRows(rows, availableTags = []) {
  const queryBody = {};
  const usedNames = new Set();

  if (!rows.length) {
    return {
      ok: false,
      error: "Please add at least one query tag.",
      body: {},
    };
  }

  for (const row of rows) {
    const tagName = normaliseTagInput(row.name);
    const countText = String(row.count || "").trim();

    if (!tagName) {
      return {
        ok: false,
        error: "Query tag name cannot be empty.",
        body: {},
      };
    }

    const formatCheck = validateTagFormat(tagName, "Query tag name");

    if (!formatCheck.ok) {
      return {
        ok: false,
        error: formatCheck.error,
        body: {},
      };
    }

    if (!isExistingTag(tagName, availableTags)) {
      return {
        ok: false,
        error: `"${tagName}" is not in the current tag list. Please choose an existing tag from the suggestions.`,
        body: {},
      };
    }

    if (usedNames.has(tagName)) {
      return {
        ok: false,
        error: `Duplicate query tag "${tagName}" found. Please keep each tag only once.`,
        body: {},
      };
    }

    if (!/^[1-9][0-9]*$/.test(countText)) {
      return {
        ok: false,
        error:
          "Invalid minimum count. Count must be a positive whole number, for example 1, 2, or 3.",
        body: {},
      };
    }

    usedNames.add(tagName);
    queryBody[tagName] = Number(countText);
  }

  return {
    ok: true,
    error: "",
    body: queryBody,
  };
}

function buildTagRowsFromItems(items) {
  const mergedTags = {};

  items.forEach((item) => {
    Object.entries(item.tags || {}).forEach(([tag, count]) => {
      const cleanTag = normaliseTagInput(tag);

      if (TAG_INPUT_PATTERN.test(cleanTag)) {
        mergedTags[cleanTag] = String(Number(count) || 1);
      }
    });
  });

  const rows = Object.entries(mergedTags).map(([name, count], index) => ({
    id: `${name}-${index}`,
    name,
    count,
    isExisting: true,
  }));

  if (rows.length === 0) {
    return [
      {
        id: `empty-${Date.now()}`,
        name: "",
        count: "1",
      },
    ];
  }

  return rows;
}

function createEmptyTagRow() {
  return {
    id: `tag-${Date.now()}-${Math.random()}`,
    name: "",
    count: "1",
    isExisting: false,
  };
}

function createEditorFromItem(item, index) {
  return {
    editorId: item.file_id || `editor-${index}`,
    file_id: item.file_id || "",
    file_type: item.file_type || "",
    display_url: item.display_url || "",
    file_url: item.file_url || "",
    thumbnail_url: item.thumbnail_url || "",
    originalItem: item,
    operation: "1",
    tagRows: buildTagRowsFromItems([item]),
    removeTagNames: [],
  };
}

function validateAddUpdateRows(rows) {
  const tagMap = {};
  const usedNames = new Set();

  if (!rows.length) {
    return {
      ok: false,
      error: "Please provide at least one tag.",
      tags: {},
    };
  }

  for (const row of rows) {
    const tagName = normaliseTagInput(row.name);
    const countText = String(row.count || "").trim();

    const formatCheck = validateTagFormat(tagName, "Tag name");

    if (!formatCheck.ok) {
      return {
        ok: false,
        error: formatCheck.error,
        tags: {},
      };
    }

    if (usedNames.has(tagName)) {
      return {
        ok: false,
        error: `Duplicate tag "${tagName}" found. Please keep each tag only once.`,
        tags: {},
      };
    }

    if (!/^[1-9][0-9]*$/.test(countText)) {
      return {
        ok: false,
        error:
          "Invalid tag count. Count must be a positive whole number, for example 1, 2, or 3.",
        tags: {},
      };
    }

    usedNames.add(tagName);
    tagMap[tagName] = Number(countText);
  }

  return {
    ok: true,
    error: "",
    tags: tagMap,
  };
}

function validateRemoveSelection(removeTagNames) {
  if (!removeTagNames.length) {
    return {
      ok: false,
      error: "Please select at least one tag to remove.",
      tags: {},
    };
  }

  const tagMap = {};

  for (const tag of removeTagNames) {
    const tagName = normaliseTagInput(tag);

    const formatCheck = validateTagFormat(tagName, "Remove tag");

    if (!formatCheck.ok) {
      return {
        ok: false,
        error: formatCheck.error,
        tags: {},
      };
    }

    tagMap[tagName] = 1;
  }

  return {
    ok: true,
    error: "",
    tags: tagMap,
  };
}

function ResultList({
  results,
  selectedTagItems,
  setSelectedTagItems,
  goToManageTags,
}) {

  const [copyMessage, setCopyMessage] = useState("");

  if (results.length === 0) {
    return null;
  }

  function isItemSelected(item) {
    return selectedTagItems.some(
      (selectedItem) => selectedItem.file_id === item.file_id
    );
  }

  function toggleSelectedItem(item) {
    if (!item.file_id || !item.can_edit) {
      return;
    }

    if (isItemSelected(item)) {
      setSelectedTagItems(
        selectedTagItems.filter(
          (selectedItem) => selectedItem.file_id !== item.file_id
        )
      );
      return;
    }

    setSelectedTagItems([...selectedTagItems, item]);
  }

  return (
    <>
      <div className="result-toolbar">
        <div>
          <strong>{selectedTagItems.length}</strong> file(s) selected
        </div>

        <button
          type="button"
          disabled={selectedTagItems.length === 0}
          onClick={goToManageTags}
        >
          Edit selected tags
        </button>
      </div>

      {copyMessage && <p className="success-message">{copyMessage}</p>}

      <div className="result-grid clean-result-grid">
        {results.map((item, index) => {
          const displayUrl = getDisplayUrl(item);
          const fullMediaUrl = getFullMediaUrl(item);
          const isSelected = isItemSelected(item);
          const canSelect = Boolean(item.file_id) && item.can_edit;
          const copyableThumbnailUrl = getCopyableThumbnailUrl(item);

          return (
            <div
              className={`result-card clean-result-card ${
                isSelected ? "selected" : ""
              }`}
              key={item.file_id || item.id || index}
            >
              <div className="result-select-row">
                <label className="select-result-control">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={!canSelect}
                    onChange={() => toggleSelectedItem(item)}
                  />
                  <span>
                    {!item.file_id
                      ? "Missing file_id, cannot edit tags"
                      : item.can_edit
                        ? "Select for tag editing"
                        : "View only - tag editing disabled"}
                  </span>
                </label>
              </div>

              <div className="result-preview-frame">
                {item.file_type === "image" ? (
                  <a href={fullMediaUrl} target="_blank" rel="noreferrer">
                    <img src={displayUrl} alt="Wildlife thumbnail preview" />
                  </a>
                ) : item.file_type === "video" ? (
                  <video src={fullMediaUrl} controls muted preload="metadata" style={{ width: "100%", maxHeight: "210px", display: "block" }} />
                ) : (
                  <div className="video-box">No Preview</div>
                )}
              </div>

              <div className="result-meta-row">
                <span>{String(item.file_type || "file").toUpperCase()}</span>
                <small>{isSelected ? "Selected" : "Matched result"}</small>
              </div>

              <div className="permission-chip-row">
                <span
                  className={`permission-chip ${
                    item.is_mine
                      ? "mine-chip"
                      : item.isPersonal
                        ? "private-chip"
                        : "public-chip"
                  }`}
                >
                  {getPermissionChipText(item)}
                </span>
              </div>

              {item.tags && Object.keys(item.tags).length > 0 ? (
                <div className="badge-row">
                  {Object.entries(item.tags).map(([tag, count]) => (
                    <span className="badge" key={tag}>
                      {tag} × {count}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="hint">Tags are not included in this query response.</p>
              )}

              {fullMediaUrl && (
                <a
                  className="preview-link"
                  href={fullMediaUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.file_type === "video" ? "Open full video" : "Open full image"}
                </a>
              )}


              {copyableThumbnailUrl && (
                <button
                  type="button"
                  className="secondary-button copy-url-button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(copyableThumbnailUrl);
                    setCopyMessage("Thumbnail URL copied. You can paste it into Thumbnail URL search.");
                  }}
                >
                  Copy thumbnail URL
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function TagManagementPage({
  selectedTagItems,
  setSelectedTagItems,
  clearSelectedTagItems,
  availableTags,
  isLoadingTags,
  refreshAvailableTags,
}) {
  const [message, setMessage] = useState("");
  const [tagResults, setTagResults] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fileEditors, setFileEditors] = useState(
    selectedTagItems.map((item, index) => createEditorFromItem(item, index))
  );

  useEffect(() => {
    setFileEditors(
      selectedTagItems.map((item, index) => createEditorFromItem(item, index))
    );
    setMessage("");
    setTagResults([]);
    setIsSubmitting(false);
  }, [selectedTagItems]);

  function updateEditorOperation(editorId, value) {
    setFileEditors((previousEditors) =>
      previousEditors.map((editor) =>
        editor.editorId === editorId
          ? {
              ...editor,
              operation: value,
              removeTagNames: [],
            }
          : editor
      )
    );
  }

  function updateEditorTagRow(editorId, rowId, field, value) {
    setFileEditors((previousEditors) =>
      previousEditors.map((editor) =>
        editor.editorId === editorId
          ? {
              ...editor,
              tagRows: editor.tagRows.map((row) =>
                row.id === rowId
                  ? {
                      ...row,
                      [field]: value,
                    }
                  : row
              ),
            }
          : editor
      )
    );
  }

  function addEditorTagRow(editorId) {
    setFileEditors((previousEditors) =>
      previousEditors.map((editor) =>
        editor.editorId === editorId
          ? {
              ...editor,
              tagRows: [...editor.tagRows, createEmptyTagRow()],
            }
          : editor
      )
    );
  }

  function removeEditorTagRow(editorId, rowId) {
    setFileEditors((previousEditors) =>
      previousEditors.map((editor) => {
        if (editor.editorId !== editorId) {
          return editor;
        }

        const targetRow = editor.tagRows.find((row) => row.id === rowId);

        if (targetRow?.isExisting) {
          setMessage(
            "Existing tags cannot be removed in Add or update mode. Use Remove selected tags instead."
          );
          return editor;
        }

        const remainingRows = editor.tagRows.filter((row) => row.id !== rowId);

        return {
          ...editor,
          tagRows: remainingRows.length > 0 ? remainingRows : [createEmptyTagRow()],
        };
      })
    );
  }

  function toggleEditorRemoveTag(editorId, tagName) {
    setFileEditors((previousEditors) =>
      previousEditors.map((editor) => {
        if (editor.editorId !== editorId) {
          return editor;
        }

        const exists = editor.removeTagNames.includes(tagName);

        return {
          ...editor,
          removeTagNames: exists
            ? editor.removeTagNames.filter((item) => item !== tagName)
            : [...editor.removeTagNames, tagName],
        };
      })
    );
  }

  function getEditorCurrentTags(editor) {
    const tags = {};

    editor.tagRows.forEach((row) => {
      const name = normaliseTagInput(row.name);
      const count = String(row.count || "").trim();

      if (TAG_INPUT_PATTERN.test(name) && /^[1-9][0-9]*$/.test(count)) {
        tags[name] = Number(count);
      }
    });

    return tags;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setTagResults([]);
    setIsSubmitting(true);

    if (fileEditors.length === 0) {
      setMessage("Please query and select at least one file before editing tags.");
      setIsSubmitting(false);
      return;
    }

    const updates = [];

    for (const editor of fileEditors) {
      if (!editor.file_id) {
        setMessage("One selected file is missing file_id and cannot be updated.");
        setIsSubmitting(false);
        return;
      }

      const parsed =
        editor.operation === "1"
          ? validateAddUpdateRows(editor.tagRows)
          : validateRemoveSelection(editor.removeTagNames);

      if (!parsed.ok) {
        setMessage(`File ${editor.file_id}: ${parsed.error}`);
        setIsSubmitting(false);
        return;
      }

      updates.push({
        file_id: editor.file_id,
        tags: parsed.tags,
        operation: Number(editor.operation),
      });
    }

    try {
      setMessage("Submitting independent tag updates...");

      const response = await fetch(`${API_URL}/tags/modify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthorizationHeader(),
        },
        body: JSON.stringify({
          updates,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Tag modification failed.");
      }

      const updatedCount = Array.isArray(data.results)
        ? data.results.filter((item) => item.status === "updated").length
        : updates.length;

      setMessage(
        data.message ||
          `Independent tag update completed successfully. ${updatedCount} file(s) updated.`
      );

      setTagResults(data.results || []);

      if (refreshAvailableTags) {
        await refreshAvailableTags();
      }

      if (Array.isArray(data.results)) {
        setSelectedTagItems((previousItems) =>
          previousItems.map((item) => {
            const matchedResult = data.results.find(
              (result) =>
                result.file_id === item.file_id && result.status === "updated"
            );

            if (!matchedResult || !matchedResult.tags) {
              return item;
            }

            return {
              ...item,
              tags: matchedResult.tags,
            };
          })
        );
      }
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Tag modification failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section>
      <div className="eyebrow">Bulk Tag Editing</div>
      <h1>Manage Tags</h1>
      <p>
        Edit species tags for selected query results. Preview images are shown
        for confirmation, while file IDs are used internally for database
        updates.
      </p>

      <div className="panel selected-files-panel">
        <div className="selected-files-header">
          <div>
            <h3>Selected files from query</h3>
            <p>{selectedTagItems.length} file(s) selected for bulk editing.</p>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={clearSelectedTagItems}
            disabled={selectedTagItems.length === 0}
          >
            Clear selection
          </button>
        </div>

        {selectedTagItems.length > 0 ? (
          <div className="selected-media-grid clean-selected-media-grid">
            {selectedTagItems.map((item, index) => {
              const displayUrl = getDisplayUrl(item);

              return (
                <div
                  className="selected-media-card clean-selected-media-card"
                  key={item.file_id || index}
                >
                  <div className="selected-thumb-frame">
                    {item.file_type === "image" ? (
                      <img
                        src={displayUrl}
                        alt={`Selected media ${index + 1}`}
                      />
                    ) : item.file_type === "video" ? (
                      <video
                        src={displayUrl}
                        controls
                        muted
                        preload="metadata"
                      />
                    ) : (
                      <div className="selected-video-box">No Preview</div>
                    )}
                  </div>

                  <div className="selected-media-info">
                    <strong>{getDisplayName(item, index)}</strong>
                    <span>{String(item.file_type || "file").toUpperCase()}</span>

                    {item.tags && Object.keys(item.tags).length > 0 ? (
                      <div className="selected-mini-tags">
                        {Object.entries(item.tags).map(([tag, count]) => (
                          <small key={tag}>
                            {tag} × {count}
                          </small>
                        ))}
                      </div>
                    ) : (
                      <small className="selected-no-tags">
                        No tag data returned
                      </small>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="hint">
            No files selected. Go to Query Files, search media, select one or
            more results, then click Edit selected tags.
          </p>
        )}
      </div>

      <form className="panel tag-edit-panel" onSubmit={handleSubmit}>
        <div className="status-box warning">
          <h3>Independent bulk editing</h3>
          <p>
            Each selected file has its own tag editor below. You can edit tags
            differently for each file, then submit all updates together.
          </p>
        </div>

        {fileEditors.length > 0 ? (
          <div className="per-file-editor-list">
            {fileEditors.map((editor, index) => {
              const currentTags = getEditorCurrentTags(editor);
              const currentTagNames = Object.keys(currentTags);
              const displayUrl = getDisplayUrl(editor.originalItem);

              return (
                <div className="per-file-editor-card" key={editor.editorId}>
                  <div className="per-file-editor-header">
                    <div className="selected-thumb-frame per-file-preview">
                      {editor.file_type === "image" ? (
                        <img
                          src={displayUrl}
                          alt={`Selected media ${index + 1}`}
                        />
                      ) : editor.file_type === "video" ? (
                        <video
                          src={displayUrl}
                          controls
                          muted
                          preload="metadata"
                        />
                      ) : (
                        <div className="selected-video-box">No Preview</div>
                      )}
                    </div>

                    <div>
                      <h3>{getDisplayName(editor.originalItem, index)}</h3>
                      <p className="hint">
                        <strong>File ID:</strong> {editor.file_id}
                      </p>
                      <span className="badge">
                        {String(editor.file_type || "file").toUpperCase()}
                      </span>
                    </div>
                  </div>

                  <label>Operation for this file</label>
                  <select
                    value={editor.operation}
                    onChange={(event) =>
                      updateEditorOperation(editor.editorId, event.target.value)
                    }
                  >
                    <option value="1">Add or update tag counts</option>
                    <option value="0">Remove selected tags</option>
                  </select>

                  {editor.operation === "1" ? (
                    <div className="tag-editor-table">
                      <div className="tag-editor-header">
                        <span>Tag name</span>
                        <span>Count</span>
                        <span>Action</span>
                      </div>

                      {editor.tagRows.map((row) => (
                        <div className="tag-editor-row" key={row.id}>
                          <SpeciesAutocomplete
                            value={row.name}
                            onChange={(value) =>
                              updateEditorTagRow(
                                editor.editorId,
                                row.id,
                                "name",
                                value
                              )
                            }
                            options={availableTags}
                            disabled={editor.operation === "1" && row.isExisting}
                            placeholder={
                              isLoadingTags
                                ? "Loading tags..."
                                : "Type existing tag or add a new tag"
                            }
                          />

                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={row.count}
                            onChange={(event) =>
                              updateEditorTagRow(
                                editor.editorId,
                                row.id,
                                "count",
                                event.target.value
                              )
                            }
                            placeholder="1"
                          />

                          <button
                            type="button"
                            className="secondary-button tag-row-remove-button"
                            disabled={editor.operation === "1" && row.isExisting}
                            onClick={() =>
                              removeEditorTagRow(editor.editorId, row.id)
                            }
                          >
                            Remove row
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        className="secondary-button add-tag-button"
                        onClick={() => addEditorTagRow(editor.editorId)}
                      >
                        + Add tag for this file
                      </button>
                    </div>
                  ) : (
                    <div className="remove-tag-panel">
                      <h3>Select tags to remove from this file</h3>

                      {currentTagNames.length > 0 ? (
                        <div className="remove-tag-grid">
                          {currentTagNames.map((tagName) => (
                            <label className="remove-tag-card" key={tagName}>
                              <input
                                type="checkbox"
                                checked={editor.removeTagNames.includes(tagName)}
                                onChange={() =>
                                  toggleEditorRemoveTag(editor.editorId, tagName)
                                }
                              />
                              <span>{tagName}</span>
                              <small>current count: {currentTags[tagName]}</small>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="hint">
                          No valid current tags are available to remove for this file.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="hint">
            No files selected. Go to Query Files or Browse All, select one or more
            files, then click Edit selected tags.
          </p>
        )}

        <button type="submit" disabled={fileEditors.length === 0 || isSubmitting}>
          {isSubmitting ? "Updating tags..." : "Submit all file tag updates"}
        </button>

        {message && (
          <div
            className={`status-box ${
              message.toLowerCase().includes("failed") ||
              message.toLowerCase().includes("invalid") ||
              message.toLowerCase().includes("please") ||
              message.toLowerCase().includes("missing")
                ? "error"
                : "success"
            }`}
          >
            <h3>{message}</h3>
          </div>
        )}

        {tagResults.length > 0 && (
          <div className="tag-result-list">
            {tagResults.map((item, index) => (
              <div className="tag-result-card" key={item.file_id || index}>
                <div className="result-meta-row">
                  <span>{String(item.status || "result").toUpperCase()}</span>
                  <small>{item.file_id || "No file id"}</small>
                </div>

                {item.message && <p className="hint">{item.message}</p>}

                {item.tags && (
                  <div className="badge-row">
                    {Object.entries(item.tags).map(([tag, count]) => (
                      <span className="badge" key={tag}>
                        {tag} × {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="hint">
          Each file is submitted as a separate update inside one bulk request.
        </p>
      </form>
    </section>
  );
}

function createEmptyDeleteUrlRow() {
  return {
    id: `delete-url-${Date.now()}-${Math.random()}`,
    url: "",
  };
}

function validateDeleteUrlRows(rows) {
  const urls = [];
  const usedUrls = new Set();

  for (const row of rows) {
    const url = String(row.url || "").trim();

    if (!url) {
      continue;
    }

    if (!/^https?:\/\/.+/i.test(url)) {
      return {
        ok: false,
        error: "Each delete URL must be a valid HTTP or HTTPS URL.",
        urls: [],
      };
    }

    if (usedUrls.has(url)) {
      return {
        ok: false,
        error: "Duplicate delete URL found. Please keep each URL only once.",
        urls: [],
      };
    }

    usedUrls.add(url);
    urls.push(url);
  }

  if (urls.length === 0) {
    return {
      ok: false,
      error: "Please enter at least one file URL to delete.",
      urls: [],
    };
  }

  return {
    ok: true,
    error: "",
    urls,
  };
}

function DeletePage({ initialUrls = [], onMounted }) {
  const [message, setMessage] = useState("");
  const [deleteRows, setDeleteRows] = useState(
    initialUrls.length > 0
      ? initialUrls.map((url) => ({ id: `delete-url-${Date.now()}-${Math.random()}`, url }))
      : [createEmptyDeleteUrlRow()]
  );
  const [deleteResults, setDeleteResults] = useState([]);

  useEffect(() => {
    if (onMounted) onMounted();
  }, []);

  function updateDeleteRow(rowId, value) {
    setDeleteRows(
      deleteRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              url: value,
            }
          : row
      )
    );
  }

  function addDeleteRow() {
    setDeleteRows([...deleteRows, createEmptyDeleteUrlRow()]);
  }

  function removeDeleteRow(rowId) {
    if (deleteRows.length === 1) {
      setDeleteRows([createEmptyDeleteUrlRow()]);
      return;
    }

    setDeleteRows(deleteRows.filter((row) => row.id !== rowId));
  }

  async function handleDelete(event) {
    event.preventDefault();
    setMessage("");
    setDeleteResults([]);

    const parsed = validateDeleteUrlRows(deleteRows);

    if (!parsed.ok) {
      setMessage(parsed.error);
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${parsed.urls.length} file(s)?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setMessage("Deleting selected files...");

      const response = await fetch(`${API_URL}/files`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthorizationHeader(),
        },
        body: JSON.stringify({
          urls: parsed.urls,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Delete request failed.");
      }

      setMessage(data.message || "Delete request completed.");
      setDeleteResults(data.results || []);
      setDeleteRows([createEmptyDeleteUrlRow()]);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Delete request failed.");
    }
  }

  return (
    <section>
      <div className="eyebrow">Storage and DB Cleanup</div>
      <h1>Delete Files</h1>
      <p>
        Delete original media files, generated thumbnails, and corresponding
        database records. Paste one original file URL per row.
      </p>

      <form className="panel delete-edit-panel" onSubmit={handleDelete}>
        <div className="delete-editor-table">
          <div className="delete-editor-header">
            <span>File URL</span>
            <span>Action</span>
          </div>

          {deleteRows.map((row) => (
            <div className="delete-editor-row" key={row.id}>
              <input
                type="text"
                value={row.url}
                onChange={(event) => updateDeleteRow(row.id, event.target.value)}
                placeholder="Paste original file URL here"
              />

              <button
                type="button"
                className="secondary-button delete-row-remove-button"
                onClick={() => removeDeleteRow(row.id)}
              >
                Remove row
              </button>
            </div>
          ))}

          <button
            type="button"
            className="secondary-button add-delete-row-button"
            onClick={addDeleteRow}
          >
            + Add URL
          </button>

          <p className="hint">
            Copy a file URL from Mine and paste it here. Presigned URLs are accepted
            because the backend removes query parameters before matching DynamoDB records.
            Only your own uploaded files can be deleted.
          </p>
        </div>

        <button type="submit" className="danger-button">
          Delete Files
        </button>

        <MessageBox message={message} />

        {deleteResults.length > 0 && (
          <div className="tag-result-list">
            {deleteResults.map((item, index) => (
              <div className="tag-result-card" key={item.file_id || item.url || index}>
                <div className="result-meta-row">
                  <span>{String(item.status || "result").toUpperCase()}</span>
                  <small>{item.file_id || item.url || "No identifier"}</small>
                </div>

                {item.message && <p className="hint">{item.message}</p>}

                {item.deleted_keys && item.deleted_keys.length > 0 && (
                  <div className="badge-row">
                    {item.deleted_keys.map((key) => (
                      <span className="badge" key={key}>
                        {key}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}

function createEmptyNotificationTagRow() {
  return {
    id: `notification-tag-${Date.now()}-${Math.random()}`,
    tag: "",
  };
}

function NotificationPage({ availableTags, isLoadingTags }) {
  const [email, setEmail] = useState("");
  const [tagRows, setTagRows] = useState([createEmptyNotificationTagRow()]);
  const [message, setMessage] = useState("");
  const [resultDetails, setResultDetails] = useState([]);
  const [unsubWarning, setUnsubWarning] = useState(false);

  function updateTagRow(rowId, value) {
    setTagRows(
      tagRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              tag: value,
            }
          : row
      )
    );
  }

  function addTagRow() {
    setTagRows([...tagRows, createEmptyNotificationTagRow()]);
  }

  function removeTagRow(rowId) {
    if (tagRows.length === 1) {
      setTagRows([createEmptyNotificationTagRow()]);
      return;
    }

    setTagRows(tagRows.filter((row) => row.id !== rowId));
  }

  function validateNotificationTags() {
    const tags = [];
    const usedTags = new Set();

    for (const row of tagRows) {
      const tag = normaliseTagInput(row.tag);

      if (!tag) {
        continue;
      }

      const formatCheck = validateTagFormat(tag, "Notification tag");

      if (!formatCheck.ok) {
        return {
          ok: false,
          error: formatCheck.error,
          tags: [],
        };
      }

      if (!isExistingTag(tag, availableTags)) {
        return {
          ok: false,
          error: `"${tag}" is not in the current tag list. Please choose an existing tag from the suggestions.`,
          tags: [],
        };
      }

      if (!usedTags.has(tag)) {
        usedTags.add(tag);
        tags.push(tag);
      }
    }

    if (tags.length === 0) {
      return {
        ok: false,
        error: "Please enter at least one species tag.",
        tags: [],
      };
    }

    return {
      ok: true,
      error: "",
      tags,
    };
  }

  async function handleSubscribe(event) {
    event.preventDefault();
    setMessage("");
    setResultDetails([]);

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("Please enter an email address.");
      return;
    }

    const parsedTags = validateNotificationTags();

    if (!parsedTags.ok) {
      setMessage(parsedTags.error);
      return;
    }

    try {
      setMessage("Creating SNS email subscription...");

      const response = await fetch(`${API_URL}/notify/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthorizationHeader(),
        },
        body: JSON.stringify({
          email: cleanEmail,
          tags: parsedTags.tags,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Subscribe failed.");
      }

      setMessage(
        data.message ||
          "Subscription request created. Please confirm it from your email inbox."
      );

      setResultDetails([
        `Email: ${data.email || cleanEmail}`,
        `Tags: ${(data.tags || parsedTags.tags).join(", ")}`,
        `Subscription ARN: ${data.subscription_arn || "Pending confirmation"}`,
      ]);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Subscribe failed.");
    }
  }

  async function handleUnsubscribe(event) {
    event.preventDefault();
    setMessage("");
    setResultDetails([]);

    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("Please enter an email address.");
      return;
    }

    try {
      setMessage("Removing SNS email subscription...");

      const response = await fetch(`${API_URL}/notify/unsubscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthorizationHeader(),
        },
        body: JSON.stringify({
          email: cleanEmail,
        }),
      });

      const data = await response.json();

      if (!response.ok && response.status !== 404) {
        throw new Error(data.error || data.message || "Unsubscribe failed.");
      }

      const removed = Array.isArray(data.removed) ? data.removed : [];
      const pending = Array.isArray(data.pending) ? data.pending : [];
      const onlyPending = removed.length === 0 && pending.length > 0;

      setUnsubWarning(onlyPending);

      setMessage(onlyPending
        ? "Could not unsubscribe: subscription is awaiting email confirmation."
        : (data.message || "Unsubscribe request completed.")
      );

      const details = [`Email: ${data.email || cleanEmail}`];

      if (removed.length > 0) {
        details.push(`Removed subscription(s): ${removed.length}`);
      }

      if (pending.length > 0) {
        details.push(
          "Some subscriptions are still pending confirmation and cannot be removed by ARN yet."
        );
      }

      setResultDetails(details);
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Unsubscribe failed.");
    }
  }

  return (
    <section>
      <div className="eyebrow">Tag-Based Notifications</div>
      <h1>Notifications</h1>
      <p>
        Subscribe an email address to species-specific upload alerts. The backend
        uses SNS filter policies so emails only receive notifications for
        matching species tags.
      </p>

      <form className="panel notification-panel">
        <label>Email address</label>
        <input
          type="email"
          placeholder="Example: user@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <div className="notification-tag-editor">
          <label>Watched species tags</label>

          {tagRows.map((row) => (
            <div className="notification-tag-row" key={row.id}>
              <SpeciesAutocomplete
                value={row.tag}
                onChange={(value) => updateTagRow(row.id, value)}
                options={availableTags}
                placeholder={
                  isLoadingTags
                    ? "Loading tags..."
                    : "Type or select existing tag"
                }
              />

              <button
                type="button"
                className="secondary-button notification-remove-button"
                onClick={() => removeTagRow(row.id)}
              >
                Remove
              </button>
            </div>
          ))}

          <button
            type="button"
            className="secondary-button add-query-tag-button"
            onClick={addTagRow}
          >
            + Add watched tag
          </button>

          <p className="hint">
            Choose existing tags from the current database tag list. Notifications are only created for tags that already exist in the media library.
          </p>
        </div>

        <div className="button-row">
          <button type="button" onClick={handleSubscribe}>
            Subscribe
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={handleUnsubscribe}
          >
            Unsubscribe
          </button>
        </div>

        <MessageBox message={message} type={unsubWarning ? "warning" : undefined} />

        {resultDetails.length > 0 && (
          <div className={`status-box ${unsubWarning ? "warning" : "success"}`}>
            <ul>
              {resultDetails.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="hint">
          Subscribe sends a confirmation email through SNS. Notifications are
          delivered only after the user confirms the subscription.
        </p>
      </form>
    </section>
  );
}

function MinePage({
  selectedTagItems,
  setSelectedTagItems,
  goToManageTags,
  goToDelete,
}) {
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [updatingFileId, setUpdatingFileId] = useState("");

  useEffect(() => {
    fetchMine();
  }, []);

  async function fetchMine() {
    setLoading(true);
    setMessage("Loading your uploaded files...");

    const authorizationHeader = getAuthorizationHeader();

    if (!authorizationHeader) {
      setMessage("Your session has expired. Please sign in again.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/files/mine`, {
        method: "GET",
        headers: {
          Authorization: authorizationHeader,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || "Failed to load your files.");
      }

      const normalised = (data.results || [])
        .map((item, index) => normaliseResultItem(item, index))
        .filter((item) => item && item.display_url);

      setResults(normalised);
      setSelectedTagItems([]);

      setMessage(
        normalised.length > 0
          ? `${normalised.length} uploaded file(s) found.`
          : "You have not uploaded any files yet."
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Failed to load your files.");
    } finally {
      setLoading(false);
    }
  }

  async function updateVisibility(item, nextIsPersonal) {
    if (!item.file_id) {
      setMessage("Missing file_id. Visibility cannot be updated.");
      return;
    }

    const authorizationHeader = getAuthorizationHeader();

    if (!authorizationHeader) {
      setMessage("Your session has expired. Please sign in again.");
      return;
    }

    try {
      setUpdatingFileId(item.file_id);
      setMessage("Updating edit permission...");

      const response = await fetch(`${API_URL}/files/visibility`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorizationHeader,
        },
        body: JSON.stringify({
          file_id: item.file_id,
          isPersonal: nextIsPersonal,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || "Failed to update edit permission."
        );
      }

      setResults((previousResults) =>
        previousResults.map((resultItem) =>
          resultItem.file_id === item.file_id
            ? {
                ...resultItem,
                isPersonal: nextIsPersonal,
                can_edit: true,
                is_mine: true,
              }
            : resultItem
        )
      );

      setSelectedTagItems((previousItems) =>
        previousItems.map((selectedItem) =>
          selectedItem.file_id === item.file_id
            ? {
                ...selectedItem,
                isPersonal: nextIsPersonal,
                can_edit: true,
                is_mine: true,
              }
            : selectedItem
        )
      );

      setMessage(
        nextIsPersonal
          ? "Only you can edit tags for this file."
          : "Other users can now edit tags for this file."
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Failed to update edit permission.");
    } finally {
      setUpdatingFileId("");
    }
  }

  function isItemSelected(item) {
    return selectedTagItems.some(
      (selectedItem) => selectedItem.file_id === item.file_id
    );
  }

  function toggleSelectedItem(item) {
    if (!item.file_id) {
      return;
    }

    if (isItemSelected(item)) {
      setSelectedTagItems(
        selectedTagItems.filter(
          (selectedItem) => selectedItem.file_id !== item.file_id
        )
      );
      return;
    }

    setSelectedTagItems([...selectedTagItems, item]);
  }

  function areAllMineFilesSelected() {
    return (
      results.length > 0 &&
      results.every((item) =>
        selectedTagItems.some(
          (selectedItem) => selectedItem.file_id === item.file_id
        )
      )
    );
  }

  function toggleSelectAllMine() {
    if (areAllMineFilesSelected()) {
      const mineFileIds = new Set(results.map((item) => item.file_id));

      setSelectedTagItems(
        selectedTagItems.filter((item) => !mineFileIds.has(item.file_id))
      );

      return;
    }

    setSelectedTagItems(results.filter((item) => item.file_id));
  }

  return (
    <section>
      <div className="eyebrow">Personal Media Control</div>

      <div className="page-header">
        <div>
          <h1>Mine</h1>
          <p>
            Manage your uploaded wildlife media. Other users can still view and
            query your files, but you control whether they can edit the tags.
          </p>
        </div>
      </div>

      <div className="panel browse-action-panel">
        <div className="button-row">
          <button type="button" onClick={fetchMine} disabled={loading || updatingFileId}>
            {loading ? "Loading..." : "Refresh my files"}
          </button>

          <button
            type="button"
            disabled={selectedTagItems.length === 0}
            onClick={goToManageTags}
          >
            Edit selected tags
          </button>

          <button
            type="button"
            className="danger-button"
            disabled={selectedTagItems.length === 0 || !goToDelete}
            onClick={() => goToDelete(selectedTagItems)}
          >
            Delete selected
          </button>
        </div>

        <p className="hint">
          <strong>{selectedTagItems.length}</strong> file(s) selected. Files marked
          as owner-only are still visible to others, but only you can edit their tags.
        </p>

        <MessageBox message={message} />
      </div>

      {results.length > 0 && (
        <div className="result-grid clean-result-grid">
          {results.map((item, index) => {
            const displayUrl = getDisplayUrl(item);
            const fullMediaUrl = getFullMediaUrl(item);
            const isSelected = isItemSelected(item);
            const copyableFileUrl = getCopyableFileUrl(item);
            const copyableThumbnailUrl = getCopyableThumbnailUrl(item);
            const isUpdating = updatingFileId === item.file_id;

            return (
              <div
                className={`result-card clean-result-card mine-media-card ${
                  isSelected ? "selected" : ""
                }`}
                key={item.file_id || item.id || index}
              >
                <div className="result-select-row">
                  <label className="select-result-control">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!item.file_id}
                      onChange={() => toggleSelectedItem(item)}
                    />
                    <span>Select for tag editing</span>
                  </label>
                </div>

                <div className="result-preview-frame">
                  {item.file_type === "image" ? (
                    <a href={fullMediaUrl} target="_blank" rel="noreferrer">
                      <img src={displayUrl} alt="My uploaded wildlife media" />
                    </a>
                  ) : item.file_type === "video" ? (
                    <video src={fullMediaUrl} controls muted preload="metadata" style={{ width: "100%", maxHeight: "210px", display: "block" }} />
                  ) : (
                    <div className="video-box">No Preview</div>
                  )}
                </div>

                <div className="result-meta-row">
                  <span>{String(item.file_type || "file").toUpperCase()}</span>
                  <small>{isSelected ? "Selected" : "My upload"}</small>
                </div>

                <div
                  className="mine-permission-row"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "10px",
                    margin: "12px 0 16px",
                  }}
                >
                  <span
                    className="mine-permission-chip mine-owner-chip"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "30px",
                      padding: "7px 12px",
                      borderRadius: "999px",
                      border: "1px solid #ddd6fe",
                      background: "#f5f3ff",
                      color: "#6d28d9",
                      fontSize: "12px",
                      fontWeight: 800,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Owner
                  </span>

                  <span
                    className={`mine-permission-chip ${
                      item.isPersonal
                        ? "mine-owner-only-chip"
                        : "mine-shared-edit-chip"
                    }`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minHeight: "30px",
                      padding: "7px 12px",
                      borderRadius: "999px",
                      border: item.isPersonal ? "1px solid #fed7aa" : "1px solid #c7d2fe",
                      background: item.isPersonal ? "#fff7ed" : "#eef2ff",
                      color: item.isPersonal ? "#c2410c" : "#4338ca",
                      fontSize: "12px",
                      fontWeight: 800,
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.isPersonal ? "Only me can edit tags" : "Others can edit tags"}
                  </span>
                </div>

                {item.tags && Object.keys(item.tags).length > 0 ? (
                  <div className="badge-row">
                    {Object.entries(item.tags).map(([tag, count]) => (
                      <span className="badge" key={tag}>
                        {tag} × {count}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="hint">No tags are available for this file.</p>
                )}

                <div className="visibility-toggle-panel">
                  <div>
                    <strong>Edit permission</strong>
                    <p className="hint">
                      {item.isPersonal
                        ? "Other users can view this file, but cannot edit its tags."
                        : "Other users can view this file and edit its tags."}
                    </p>
                  </div>

                  <div className="visibility-toggle-actions">
                    <button
                      type="button"
                      className={item.isPersonal ? "secondary-button active-toggle" : "secondary-button"}
                      disabled={isUpdating}
                      onClick={() => updateVisibility(item, true)}
                    >
                      Only me
                    </button>

                    <button
                      type="button"
                      className={!item.isPersonal ? "secondary-button active-toggle" : "secondary-button"}
                      disabled={isUpdating}
                      onClick={() => updateVisibility(item, false)}
                    >
                      Others can edit
                    </button>
                  </div>
                </div>

                {fullMediaUrl && (
                  <a
                    className="preview-link"
                    href={fullMediaUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {item.file_type === "video" ? "Open full video" : "Open full image"}
                  </a>
                )}

                {copyableFileUrl && (
                  <button
                    type="button"
                    className="secondary-button copy-url-button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(copyableFileUrl);
                      setMessage("File URL copied. You can paste it into Delete Files.");
                    }}
                  >
                    Copy file URL
                  </button>
                )}

                {copyableThumbnailUrl && (
                  <button
                    type="button"
                    className="secondary-button copy-url-button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(copyableThumbnailUrl);
                      setMessage(
                        "Thumbnail URL copied. You can paste it into Thumbnail URL search."
                      );
                    }}
                  >
                    Copy thumbnail URL
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BrowseAllPage({
  selectedTagItems,
  setSelectedTagItems,
  goToManageTags,
}) {
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setMessage("Loading all files...");

    try {
      const response = await fetch(`${API_URL}/files`, {
        method: "GET",
        headers: {
          Authorization: getAuthorizationHeader(),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to load files.");
      }

      const normalised = (data.results || [])
        .map((item, index) => normaliseResultItem(item, index))
        .filter((item) => item && item.display_url);

      setResults(normalised);
      setSelectedTagItems([]);

      setMessage(
        normalised.length > 0
          ? `${normalised.length} file(s) in the library.`
          : "No files in the library yet."
      );
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="eyebrow">Shared Media Library</div>
      <h1>Browse All Files</h1>
      <p>
        View all uploaded wildlife media files. Public and your own files can be
        selected for tag editing. Private files are view-only.
      </p>

      <div className="panel browse-action-panel">
        <div className="button-row">
          <button onClick={fetchAll} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <MessageBox message={message} />
      </div>

      <ResultList
        results={results}
        selectedTagItems={selectedTagItems}
        setSelectedTagItems={setSelectedTagItems}
        goToManageTags={goToManageTags}
      />
    </section>
  );
}

export default App;