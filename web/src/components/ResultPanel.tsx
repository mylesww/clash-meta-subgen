import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

export function ResultPanel({ url }: { url: string | null }) {
  const [copyState, setCopyState] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const outputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (copyState !== "success") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyLink() {
    if (!url) return;
    setCopyState("pending");
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("success");
    } catch {
      setCopyState("error");
      outputRef.current?.focus();
      outputRef.current?.select();
    }
  }

  return (
    <section className="result-panel" aria-labelledby="result-heading">
      <div className="panel-heading">
        <span className="step-number">02</span>
        <h2 id="result-heading">获取订阅链接</h2>
        <span className={`status-badge ${url ? "is-ready" : ""}`}>
          <span />
          {url ? "已生成" : "等待生成"}
        </span>
      </div>
      {url ? (
        <div className="result-content">
          <div className="success-heading">
            <span className="success-icon">
              <Icon name="check" />
            </span>
            <h3>订阅链接已就绪</h3>
          </div>
          <p className="result-description">
            复制下方链接，在 Clash Meta / mihomo 客户端中添加订阅。
          </p>
          <label className="sr-only" htmlFor="generated-link">
            生成的订阅链接
          </label>
          <textarea
            ref={outputRef}
            id="generated-link"
            className="result-url"
            value={url}
            readOnly
            spellCheck={false}
          />
          <div className="result-actions">
            <button
              className="button button-primary"
              type="button"
              onClick={copyLink}
              disabled={copyState === "pending"}
            >
              <Icon name={copyState === "success" ? "check" : "copy"} />
              {copyState === "success"
                ? "已复制"
                : copyState === "pending"
                  ? "正在复制…"
                  : "复制链接"}
            </button>
            <a
              className="button button-secondary"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              打开链接
              <Icon name="external" />
            </a>
          </div>
          <p
            className={
              copyState === "error"
                ? "copy-feedback field-error"
                : "copy-feedback"
            }
            role="status"
            aria-live="polite"
          >
            {copyState === "error"
              ? "无法自动复制，已选中链接，请手动复制。"
              : copyState === "success"
                ? "链接已复制到剪贴板"
                : "\u00a0"}
          </p>
        </div>
      ) : (
        <div className="result-empty">
          <div className="link-illustration" aria-hidden="true">
            <span className="illustration-node">
              <Icon name="file" />
            </span>
            <span className="illustration-connector" />
            <span className="illustration-main">
              <Icon name="link" />
            </span>
            <span className="illustration-connector" />
            <span className="illustration-node">
              <Icon name="check" />
            </span>
          </div>
          <h3>连接配置，开启下一步</h3>
          <p>
            完成表单后生成链接，
            <br />
            即可复制并导入你的客户端。
          </p>
        </div>
      )}
      <div className="result-footnote">
        <Icon name="link" />
        <p>
          打开订阅链接时，服务会拉取配置与节点，生成完整的 Clash Meta YAML。
        </p>
      </div>
    </section>
  );
}
