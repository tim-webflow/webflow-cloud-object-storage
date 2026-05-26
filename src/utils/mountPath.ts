// Returns the deployment's mount path as a base URL guaranteed to start
// and end with "/". Cosmic injects COSMIC_MOUNT_PATH as a worker env var
// (e.g. "/" for root deployments, "/app" for sub-path deployments).
export function getMountPath(locals: App.Locals): string {
  const raw =
    (locals?.runtime?.env as Record<string, string> | undefined)
      ?.COSMIC_MOUNT_PATH ?? "/";
  const trimmed = raw.replace(/^\/|\/$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}
