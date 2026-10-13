import { useRef, useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { ResultPanel } from "../components/ResultPanel";
import {
  createSubscriptionUrl,
  parseSubscriptionUrl,
  readSubscriptionValues,
  type FieldErrors,
  type SubscriptionValues,
} from "../lib/links";

function readInitialForm(search: string, legacy: boolean) {
  const params = new URLSearchParams(search);
  const link = legacy ? params.get("baseLink") ?? "" : "";
  const parsed = link ? parseSubscriptionUrl(link) : null;
  const queryValues = readSubscriptionValues(search);

  return {
    link,
    error: parsed && !parsed.ok ? parsed.error : undefined,
    values: parsed?.ok
      ? {
          ...parsed.values,
          subs: params.has("subs") ? queryValues.subs : parsed.values.subs,
        }
      : queryValues,
  };
}

export function SubscriptionPage({ legacy = false }: { legacy?: boolean }) {
  const { search } = useLocation();
  const [initial] = useState(() => readInitialForm(search, legacy));
  const [values, setValues] = useState(initial.values);
  const [existingLink, setExistingLink] = useState(initial.link);
  const [importError, setImportError] = useState(initial.error);
  const [imported, setImported] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<SubscriptionValues>>({});
  const [url, setUrl] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const configRef = useRef<HTMLInputElement>(null);

  function update(field: keyof SubscriptionValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setUrl(null);
    setImported(false);
  }

  function restore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseSubscriptionUrl(existingLink);
    if (!result.ok) {
      setImportError(result.error);
      setImported(false);
      (
        event.currentTarget.elements.namedItem("existingLink") as HTMLInputElement
      )?.focus();
      return;
    }
    setValues(result.values);
    setErrors({});
    setUrl(null);
    setShowToken(false);
    setImportError(undefined);
    setImported(true);
    configRef.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createSubscriptionUrl(window.location.origin, values);
    if (!result.ok) {
      setErrors(result.errors);
      setUrl(null);
      const field = Object.keys(result.errors)[0];
      (
        event.currentTarget.elements.namedItem(field) as
          HTMLInputElement | HTMLTextAreaElement
      )?.focus();
      return;
    }
    setErrors({});
    if (
      !values.token.trim() &&
      !window.confirm(
        "未填写访问令牌（token），访问订阅时可能无法通过鉴权。是否继续生成？",
      )
    ) {
      return;
    }
    setUrl(result.url);
  }

  return (
    <div className="workspace">
      <section className="form-panel" aria-labelledby="form-heading">
        <div className="panel-heading">
          <span className="step-number">01</span>
          <h2 id="form-heading">配置你的订阅</h2>
        </div>
        <p className="panel-description">
          填写配置与可选的额外订阅，也可以从已有链接恢复。
        </p>
        <form className="import-form" noValidate onSubmit={restore}>
          <Field
            id="existingLink"
            label="已有订阅链接"
            parameter="可选"
            hint="粘贴之前生成的完整链接，点击解析后覆盖下方配置。"
            error={importError}
          >
            <div className="import-controls">
              <input
                id="existingLink"
                name="existingLink"
                type="url"
                placeholder="https://example.com/sub?config=…&extra=…&token=…"
                value={existingLink}
                onChange={(event) => {
                  setExistingLink(event.target.value);
                  setImportError(undefined);
                  setImported(false);
                }}
                aria-invalid={Boolean(importError)}
                aria-describedby="existingLink-hint"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="button button-secondary" type="submit">
                解析并回填
              </button>
            </div>
          </Field>
          <p className="import-feedback" role="status" aria-live="polite">
            {imported ? "已回填配置，可继续编辑并生成订阅链接。" : ""}
          </p>
        </form>
        <form noValidate onSubmit={submit}>
          <Field
            id="config"
            label="订阅配置"
            parameter="config"
            hint="定义节点来源、策略组与分流规则的 YAML 文件。"
            error={errors.config}
          >
            <input
              ref={configRef}
              id="config"
              name="config"
              type="url"
              required
              placeholder="https://example.com/config.yaml"
              value={values.config}
              onChange={(event) => update("config", event.target.value)}
              aria-invalid={Boolean(errors.config)}
              aria-describedby="config-hint"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field
            id="extra"
            label="基础配置"
            parameter="extra"
            hint="定义 DNS、端口、TUN 等基础设置的 YAML 文件。"
            error={errors.extra}
          >
            <input
              id="extra"
              name="extra"
              type="url"
              required
              placeholder="https://example.com/extra.yaml"
              value={values.extra}
              onChange={(event) => update("extra", event.target.value)}
              aria-invalid={Boolean(errors.extra)}
              aria-describedby="extra-hint"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <Field
            id="token"
            label="访问令牌"
            parameter="token · 可选"
            hint="填写部署服务时设置的 ACCESS_TOKEN；留空时需确认后继续生成。"
            error={errors.token}
          >
            <div className="input-with-action">
              <input
                id="token"
                name="token"
                type={showToken ? "text" : "password"}
                placeholder="可选，输入你的访问令牌"
                value={values.token}
                onChange={(event) => update("token", event.target.value)}
                aria-invalid={Boolean(errors.token)}
                aria-describedby="token-hint"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                className="input-action"
                type="button"
                onClick={() => setShowToken(!showToken)}
                aria-label={showToken ? "隐藏访问令牌" : "显示访问令牌"}
                aria-pressed={showToken}
              >
                <Icon name={showToken ? "eyeOff" : "eye"} />
              </button>
            </div>
          </Field>
          <Field
            id="subs"
            label="额外订阅链接"
            parameter="可选"
            hint="每行一个 HTTPS 链接；留空则不添加额外订阅。"
            error={errors.subs}
          >
            <textarea
              id="subs"
              name="subs"
              rows={5}
              placeholder={
                "https://example.com/sub-a\nhttps://example.com/sub-b"
              }
              value={values.subs}
              onChange={(event) => update("subs", event.target.value)}
              aria-invalid={Boolean(errors.subs)}
              aria-describedby="subs-hint"
              autoCapitalize="none"
              spellCheck={false}
            />
          </Field>
          <button
            className="button button-primary generate-button"
            type="submit"
          >
            生成订阅链接
            <Icon name="arrow" />
          </button>
        </form>
      </section>
      <ResultPanel key={url ?? "empty"} url={url} />
    </div>
  );
}
