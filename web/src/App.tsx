import { useEffect } from "react";
import { Link, Route, Routes, useLocation, useMatch } from "react-router";
import { Icon } from "./components/Icon";
import { SubscriptionPage } from "./pages/SubscriptionPage";

export function App() {
  const location = useLocation();
  const append = Boolean(useMatch("/append-subs"));
  const knownPage = Boolean(useMatch("/")) || append;

  useEffect(() => {
    document.title = `Clash Meta · ${knownPage ? "订阅生成" : "页面不存在"}`;
  }, [knownPage]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳转到主要内容
      </a>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="Clash Meta 首页">
            <img src="/favicon.svg" width="38" height="38" alt="" />
            <span>
              Clash Meta<span className="brand-caption">订阅工具</span>
            </span>
          </Link>
          <a
            className="repository-link"
            href="https://github.com/mylesww/clash-meta-subgen"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
            <Icon name="external" />
          </a>
        </div>
      </header>
      <main id="main" className="main-content" tabIndex={-1}>
        {knownPage && (
          <div className="page-intro">
            <div className="eyebrow">
              <span className="eyebrow-line" />
              CLASH META / MIHOMO
            </div>
            <h1>一份链接，连接所有节点。</h1>
            <p>将节点来源与分流配置组合，生成专属于你的 Clash Meta 订阅。</p>
          </div>
        )}
        <Routes location={location} key={location.pathname + location.search}>
          <Route path="/" element={<SubscriptionPage />} />
          <Route path="/append-subs" element={<SubscriptionPage />} />
          <Route
            path="*"
            element={
              <section className="not-found">
                <span className="not-found-code">404</span>
                <h1>页面不存在</h1>
                <p>这个地址没有对应的页面，返回首页开始生成订阅。</p>
                <Link to="/" className="button button-primary">
                  返回首页
                  <Icon name="arrow" />
                </Link>
              </section>
            }
          />
        </Routes>
        {knownPage && (
          <ol className="usage-steps" aria-label="使用步骤">
            <li>
              <span>01</span>
              <div>
                <h3>准备配置</h3>
                <p>使用可直接访问的配置文件链接</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>生成链接</h3>
                <p>组合配置，得到专属订阅地址</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>导入客户端</h3>
                <p>添加订阅，更新后即可使用</p>
              </div>
            </li>
          </ol>
        )}
      </main>
      <footer className="site-footer">
        <span>Clash Meta Subgen</span>
        <span>为你的网络，少一点繁琐。</span>
      </footer>
    </div>
  );
}
