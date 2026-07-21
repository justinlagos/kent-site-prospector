import { createHash } from "node:crypto";
import {
  DeployAdapter,
  DeployRequest,
  DeployResult,
  FatalError,
  RetryableError,
  withRetry,
  type Logger,
} from "@ksp/shared";

/**
 * Netlify deploy adapter using the file-digest API (no zip dependency):
 *   1. POST /sites            — create an isolated site named by the slug
 *   2. PATCH site password    — where the plan supports it (failure tolerated, logged)
 *   3. POST /sites/:id/deploys with {files: {path: sha1}}
 *   4. PUT  /deploys/:id/files/:path for each file Netlify reports as required
 */

const API = "https://api.netlify.com/api/v1";

export class NetlifyAdapter implements DeployAdapter {
  readonly source = "netlify";

  constructor(
    private readonly token: string,
    private readonly logger: Logger,
    private readonly passwordForPreviews: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async api<T>(pathName: string, init: RequestInit = {}): Promise<T> {
    return withRetry(async () => {
      const res = await this.fetchImpl(`${API}${pathName}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError("NETLIFY_TRANSIENT", `Netlify ${res.status} ${pathName}`);
      }
      if (!res.ok) {
        throw new FatalError("NETLIFY_ERROR", `Netlify ${res.status} ${pathName}: ${await res.text()}`);
      }
      return (await res.json()) as T;
    });
  }

  async deploy(req: DeployRequest): Promise<DeployResult> {
    const site = await this.api<{ id: string; ssl_url?: string; url: string }>(`/sites`, {
      method: "POST",
      body: JSON.stringify({ name: req.slug }),
    });

    if (req.passwordProtect && this.passwordForPreviews) {
      try {
        await this.api(`/sites/${site.id}`, {
          method: "PATCH",
          body: JSON.stringify({ password: this.passwordForPreviews }),
        });
      } catch (err) {
        this.logger.warn("netlify password protection unavailable on this plan; relying on unguessable URL + noindex", {
          siteId: site.id,
          error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
        });
      }
    }

    const result = await this.pushFiles(site.id, req.files);
    return { ...result, url: site.ssl_url ?? site.url };
  }

  async replace(siteId: string, files: Record<string, string | Buffer>): Promise<DeployResult> {
    const result = await this.pushFiles(siteId, files);
    const site = await this.api<{ ssl_url?: string; url: string }>(`/sites/${siteId}`);
    return { ...result, url: site.ssl_url ?? site.url };
  }

  async delete(siteId: string): Promise<void> {
    await withRetry(async () => {
      const res = await this.fetchImpl(`${API}/sites/${siteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (res.status === 429 || res.status >= 500) {
        throw new RetryableError("NETLIFY_TRANSIENT", `Netlify delete ${res.status}`);
      }
      if (!res.ok && res.status !== 404) {
        throw new FatalError("NETLIFY_ERROR", `Netlify delete ${res.status}`);
      }
    });
  }

  private async pushFiles(
    siteId: string,
    files: Record<string, string | Buffer>,
  ): Promise<Omit<DeployResult, "url">> {
    const digests: Record<string, string> = {};
    const byPath: Record<string, Buffer> = {};
    for (const [name, content] of Object.entries(files)) {
      const key = name.startsWith("/") ? name : `/${name}`;
      const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
      byPath[key] = buf;
      digests[key] = createHash("sha1").update(buf).digest("hex");
    }

    const deploy = await this.api<{ id: string; required?: string[] }>(`/sites/${siteId}/deploys`, {
      method: "POST",
      body: JSON.stringify({ files: digests }),
    });

    const required = new Set(deploy.required ?? []);
    for (const [pathName, buf] of Object.entries(byPath)) {
      if (required.size > 0 && !required.has(digests[pathName]!)) continue;
      await withRetry(async () => {
        const res = await this.fetchImpl(`${API}/deploys/${deploy.id}/files${pathName}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/octet-stream" },
          body: new Uint8Array(buf),
        });
        if (res.status === 429 || res.status >= 500) {
          throw new RetryableError("NETLIFY_TRANSIENT", `Netlify file upload ${res.status}`);
        }
        if (!res.ok) throw new FatalError("NETLIFY_ERROR", `Netlify file upload ${res.status}`);
      });
    }

    // Poll for ready state (bounded).
    let state = "uploading";
    let logs = "";
    for (let i = 0; i < 30; i++) {
      const d = await this.api<{ state: string; error_message?: string }>(`/deploys/${deploy.id}`);
      state = d.state;
      if (state === "ready") break;
      if (state === "error") {
        throw new RetryableError("NETLIFY_DEPLOY_FAILED", `Netlify deploy failed: ${d.error_message ?? "unknown"}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    logs = `final state: ${state}`;
    this.logger.info("netlify deploy complete", { siteId, deployId: deploy.id, state });
    return { deploymentId: deploy.id, siteId, logs };
  }
}
