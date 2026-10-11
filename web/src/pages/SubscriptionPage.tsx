import { useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { ResultPanel } from "../components/ResultPanel";
import {
  createSubscriptionUrl,
  readSubscriptionValues,
  type FieldErrors,
  type SubscriptionValues,
} from "../lib/links";

export function SubscriptionPage() {
  const { search } = useLocation();
  const [values, setValues] = useState(() => readSubscriptionValues(search));
  const [errors, setErrors] = useState<FieldErrors<SubscriptionValues>>({});
  const [url, setUrl] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  function update(field: keyof SubscriptionValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setUrl(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createSubscriptionUrl(window.location.origin, values);
    if (!result.ok) {
      setErrors(result.errors);
      setUrl(null);
      const field = Object.keys(result.errors)[0];
      (
        event.currentTarget.elements.namedItem(field) as HTMLInputElement
      )?.focus();
      return;
    }
    setErrors({});
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
          准备好两个配置文件的链接，即可开始。
        </p>
        <form noValidate onSubmit={submit}>
          <Field
            id="config"
            label="订阅配置"
            parameter="config"
            hint="定义节点来源、策略组与分流规则的 YAML 文件。"
            error={errors.config}
          >
            <input
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
            parameter="token"
            hint="填写部署服务时设置的 ACCESS_TOKEN。"
            error={errors.token}
          >
            <div className="input-with-action">
              <input
                id="token"
                name="token"
                type={showToken ? "text" : "password"}
                required
                placeholder="输入你的访问令牌"
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
