import { useState, useEffect } from "react";

interface FileData {
  name?: string;
  dateUploaded?: string;
  link?: string;
  key?: string;
  uploaded?: string;
  httpMetadata?: {
    contentType?: string;
  };
}

export default function FileUploader() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadMode, setUploadMode] = useState<"simple" | "multipart">(
    "simple"
  );

  const assetsPrefix = import.meta.env.BASE_URL.endsWith('/') ?
    import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';

  // File type icons mapping
  const fileIcons: Record<string, string> = {
    pdf: "📄",
    doc: "📝",
    docx: "📝",
    txt: "📄",
    zip: "📦",
    rar: "📦",
    video: "🎥",
    audio: "🎵",
    default: "📎",
  };

  // Get file icon based on type
  const getFileIcon = (filename: string): string => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && fileIcons[ext]) {
      return fileIcons[ext];
    }

    if (filename.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/i)) {
      return fileIcons.video;
    }
    if (filename.match(/\.(mp3|wav|flac|aac|ogg|wma)$/i)) {
      return fileIcons.audio;
    }

    return fileIcons.default;
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Check if file is an image
  const isImage = (filename: string): boolean => {
    return filename.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i) !== null;
  };

  // Load uploaded files
  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${assetsPrefix}/api/list-assets`);

      if (!response.ok) {
        throw new Error("Failed to load files");
      }

      const fileData = (await response.json()) as FileData[];

      // Remove duplicates based on file key/name
      const uniqueFiles = fileData.filter((file, index, self) => {
        const fileKey = file.key || file.name;
        return (
          fileKey &&
          index === self.findIndex((f) => (f.key || f.name) === fileKey)
        );
      });

      setFiles(uniqueFiles);
    } catch (error) {
      console.error("Error loading files:", error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Load files on component mount
  useEffect(() => {
    loadFiles();
  }, []);

  // Simple upload function
  const uploadFileSimple = async () => {
    const fileInput = document.getElementById("fileUpload") as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (!file) {
      alert("Please select a file first");
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);


      const response = await fetch(`${assetsPrefix}/api/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      setProgress(100);
      alert("File uploaded successfully!");
      loadFiles();
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  // Multipart upload function
  const uploadFileMultipart = async () => {
    const fileInput = document.getElementById("fileUpload") as HTMLInputElement;
    const file = fileInput?.files?.[0];

    if (!file) {
      alert("Please select a file first");
      return;
    }

    setIsUploading(true);
    setProgress(0);

    try {
      const BASE_CF_URL = `${assetsPrefix}/api/multipart-upload`;
      const key = file.name;
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
      const totalParts = Math.ceil(file.size / CHUNK_SIZE);

      // Step 1: Initiate upload
      const createUploadUrl = new URL(BASE_CF_URL, window.location.origin);
      createUploadUrl.searchParams.append("action", "create");

      const createResponse = await fetch(createUploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, contentType: file.type }),
      });

      const createJson = (await createResponse.json()) as { uploadId: string };
      const uploadId = createJson.uploadId;

      // Step 2: Upload parts
      const partsData = [];
      const uploadPartUrl = new URL(BASE_CF_URL, window.location.origin);
      uploadPartUrl.searchParams.append("action", "upload-part");
      uploadPartUrl.searchParams.append("uploadId", uploadId);
      uploadPartUrl.searchParams.append("key", key);

      for (let i = 0; i < totalParts; i++) {
        const start = CHUNK_SIZE * i;
        const end = Math.min(file.size, start + CHUNK_SIZE);
        const blob = file.slice(start, end);
        const partNumber = i + 1;

        uploadPartUrl.searchParams.set("partNumber", partNumber.toString());

        const uploadPartResponse = await fetch(uploadPartUrl, {
          method: "PUT",
          body: blob,
        });

        const uploadPartJson = (await uploadPartResponse.json()) as {
          etag: string;
        };
        const eTag = uploadPartJson.etag;

        partsData.push({ partNumber: partNumber, etag: eTag });

        // Update progress
        const currentProgress = ((i + 1) / totalParts) * 100;
        setProgress(currentProgress);
      }

      // Step 3: Complete upload
      const completeUploadUrl = new URL(BASE_CF_URL, window.location.origin);
      completeUploadUrl.searchParams.append("action", "complete");

      const completeResponse = await fetch(completeUploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          key,
          parts: partsData.map((part) => ({
            partNumber: part.partNumber,
            etag: part.etag,
          })),
        }),
      });

      if (!completeResponse.ok) {
        throw new Error(`Complete upload failed: ${completeResponse.status}`);
      }

      const completeResult = (await completeResponse.json()) as {
        key: string;
        etag: string;
        size: number;
      };

      alert("File uploaded successfully!");
      loadFiles();
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
      setProgress(0);
    }
  };

  const uploadFile =
    uploadMode === "simple" ? uploadFileSimple : uploadFileMultipart;

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h2
        style={{
          fontSize: "1.8rem",
          fontWeight: "600",
          marginBottom: "1.5rem",
          textAlign: "center",
          color: "#333",
        }}
      >
        File Upload Demo
      </h2>

      {/* Upload Mode Toggle */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <button
          onClick={() => setUploadMode("simple")}
          style={{
            padding: "12px 24px",
            borderRadius: "8px",
            border: "2px solid #146ef5",
            background: uploadMode === "simple" ? "#146ef5" : "transparent",
            color: uploadMode === "simple" ? "white" : "#146ef5",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: "600",
            transition: "all 0.3s ease",
          }}
        >
          Simple Upload
        </button>
        <button
          onClick={() => setUploadMode("multipart")}
          style={{
            padding: "12px 24px",
            borderRadius: "8px",
            border: "2px solid #146ef5",
            background: uploadMode === "multipart" ? "#146ef5" : "transparent",
            color: uploadMode === "multipart" ? "white" : "#146ef5",
            cursor: "pointer",
            fontSize: "1rem",
            fontWeight: "600",
            transition: "all 0.3s ease",
          }}
        >
          Multipart Upload
        </button>
      </div>

      {/* Upload Section */}
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <input
            type="file"
            id="fileUpload"
            style={{
              flex: "1",
              padding: "12px 16px",
              border: "2px solid #e1e5e9",
              borderRadius: "8px",
              fontSize: "14px",
              backgroundColor: "#fff",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#146ef5";
              e.target.style.boxShadow = "0 0 0 3px rgba(20, 110, 245, 0.1)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "#e1e5e9";
              e.target.style.boxShadow = "none";
            }}
          />
        </div>

        <button
          onClick={uploadFile}
          disabled={isUploading}
          style={{
            padding: "14px 24px",
            backgroundColor: isUploading ? "#ccc" : "#146ef5",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: isUploading ? "not-allowed" : "pointer",
            fontSize: "16px",
            fontWeight: "600",
            transition: "all 0.3s ease",
            boxShadow: isUploading
              ? "none"
              : "0 2px 4px rgba(20, 110, 245, 0.2)",
            transform: isUploading ? "none" : "translateY(0)",
          }}
          onMouseEnter={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = "#2c80fd";
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 4px 8px rgba(20, 110, 245, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isUploading) {
              e.currentTarget.style.backgroundColor = "#146ef5";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 2px 4px rgba(20, 110, 245, 0.2)";
            }
          }}
        >
          {isUploading ? (
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: "16px",
                  height: "16px",
                  border: "2px solid transparent",
                  borderTop: "2px solid white",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                }}
              ></div>
              Uploading...
            </span>
          ) : (
            `Upload File (${uploadMode === "simple" ? "Simple" : "Multipart"})`
          )}
        </button>

        {/* Upload Progress */}
        {isUploading && (
          <div style={{ marginTop: "20px" }}>
            <div
              style={{
                width: "100%",
                backgroundColor: "#f0f0f0",
                borderRadius: "8px",
                overflow: "hidden",
                height: "12px",
                boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, #146ef5 0%, #2c80fd 100%)",
                  transition: "width 0.3s ease",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(20, 110, 245, 0.3)",
                }}
              />
            </div>
            <p
              style={{
                marginTop: "8px",
                fontSize: "14px",
                textAlign: "center",
                color: "#666",
                fontWeight: "500",
              }}
            >
              Upload Progress: {Math.round(progress)}%
            </p>
          </div>
        )}
      </div>

      {/* Files Gallery */}
      <div
        style={{
          border: "1px solid #e1e5e9",
          borderRadius: "12px",
          padding: "1.5rem",
          backgroundColor: "#fafbfc",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <h3
            style={{
              fontSize: "1.3rem",
              fontWeight: "600",
              color: "#333",
              margin: 0,
            }}
          >
            Uploaded Files
          </h3>
          <button
            onClick={loadFiles}
            disabled={loading}
            style={{
              padding: "8px 16px",
              border: "1px solid #146ef5",
              background: "transparent",
              color: "#146ef5",
              borderRadius: "6px",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "14px",
              fontWeight: "500",
              transition: "all 0.3s ease",
            }}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div
              style={{
                width: "24px",
                height: "24px",
                border: "2px solid transparent",
                borderTop: "2px solid #146ef5",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
                margin: "0 auto 1rem",
              }}
            ></div>
            <p style={{ color: "#666", margin: 0 }}>Loading files...</p>
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📁</div>
            <p style={{ color: "#666", margin: 0 }}>No files uploaded yet</p>
            <p
              style={{
                color: "#999",
                fontSize: "0.9rem",
                margin: "0.5rem 0 0 0",
              }}
            >
              Upload some files to get started
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
            }}
          >
            {files.map((file, index) => {
              const fileName = file.name || file.key || "Unknown file";
              const fileKey = file.key || file.name || `file-${index}`;
              const fileLink =
                file.link ||
                (file.key
                  ? `${assetsPrefix}/api/asset?key=${file.key}`
                  : "");
              const uploadDate =
                file.dateUploaded || file.uploaded || new Date().toISOString();
              const isImageFile = isImage(fileName);

              return (
                <div
                  key={fileKey}
                  style={{
                    border: "1px solid #e1e5e9",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "white",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow =
                      "0 4px 12px rgba(0, 0, 0, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div style={{ padding: "1rem" }}>
                    {isImageFile ? (
                      <img
                        src={fileLink}
                        alt={fileName}
                        style={{
                          width: "100%",
                          height: "120px",
                          objectFit: "cover",
                          borderRadius: "6px",
                          marginBottom: "0.5rem",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "120px",
                          backgroundColor: "#f8f9fa",
                          borderRadius: "6px",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span style={{ fontSize: "2rem" }}>
                          {getFileIcon(fileName)}
                        </span>
                      </div>
                    )}
                    <h4
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: "600",
                        margin: "0 0 0.25rem 0",
                        color: "#333",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fileName}
                    </h4>
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: "#666",
                        margin: "0 0 0.5rem 0",
                      }}
                    >
                      {formatDate(uploadDate)}
                    </p>
                    <a
                      href={fileLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        backgroundColor: "#146ef5",
                        color: "white",
                        textDecoration: "none",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
                        fontWeight: "500",
                        transition: "background-color 0.3s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "#2c80fd";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "#146ef5";
                      }}
                    >
                      View
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div>
        Environment variables:
        <ul>
          <li>
            BASE_URL: {import.meta.env.BASE_URL}
          </li>
        </ul>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `,
        }}
      />
    </div>
  );
}
