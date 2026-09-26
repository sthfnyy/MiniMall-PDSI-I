import React, { useRef, useState, useEffect } from "react";
import { ArrowUpRight, ArrowRight, Pause, Play, Sparkles } from "lucide-react";
import { money, price } from "../services/catalog";

export default function Home({
  products,
  stores,
  onProduct,
  onExplore,
  onStores,
  storeCard,
}) {
  const [paused, setPaused] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const stage = useRef(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPaused(preference.matches);
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  const picks = [2, 4, 3, 5]
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean);
  const categories = [
    {
      name: "Vestuário",
      title: "Vestuário",
      image: products.find((p) => p.category === "Vestuário")?.image,
      tag: "01 / MODA",
    },
    {
      name: "Casa e decoração",
      title: "Casa e decoração",
      image: products.find((p) => p.category === "Casa e decoração")?.image,
      tag: "02 / CASA",
    },
    {
      name: "Perfumaria",
      title: "Perfumaria",
      image: products.find((p) => p.category === "Perfumaria")?.image,
      tag: "03 / CUIDADO",
    },
  ];
  function move(e) {
    if (paused || e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    stage.current?.style.setProperty(
      "--mx",
      `${((e.clientX - rect.left) / rect.width - 0.5) * 20}px`,
    );
    stage.current?.style.setProperty(
      "--my",
      `${((e.clientY - rect.top) / rect.height - 0.5) * 16}px`,
    );
  }
  function reset() {
    stage.current?.style.setProperty("--mx", "0px");
    stage.current?.style.setProperty("--my", "0px");
  }
  return (
    <div className={"homepage " + (paused ? "motion-paused" : "")}>
      <section
        className="home-hero"
        onPointerMove={move}
        onPointerLeave={reset}
      >
        <div className="home-hero-body">
          <div className="home-headline">
            <h1>
              MiniMall.
              <br />
              <em>Compre local.</em>
              <span className="home-asterisk" aria-hidden="true">
                ✳
              </span>
            </h1>
            <p>Produtos e lojas de Picos.</p>
            <div className="home-actions">
              <button className="home-cta" onClick={() => onExplore()}>
                Ver produtos
                <ArrowUpRight size={21} />
              </button>
              <button className="home-secondary" onClick={onStores}>
                Conhecer as lojas
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div
            className="floating-stage"
            ref={stage}
            aria-label="Produtos para descobrir"
          >
            <div className="orbit orbit-one" aria-hidden="true" />
            <div className="orbit orbit-two" aria-hidden="true" />
            <span className="stage-center" aria-hidden="true">
              m.
            </span>
            {picks.map((p, i) => (
              <div className={"float-position float-" + i} key={p.id}>
                <button
                  className="floating-product"
                  onClick={() => onProduct(p)}
                  aria-label={`Descobrir ${p.name}`}
                >
                  <div className="float-image">
                    <img src={p.image} alt={p.name} />
                    <span className="float-arrow">
                      <ArrowUpRight size={16} />
                    </span>
                  </div>
                  <span className="float-caption">
                    <strong>{p.name}</strong>
                    <span>{money(price(p))}</span>
                  </span>
                </button>
              </div>
            ))}

            <span className="stage-spark spark-one" aria-hidden="true">
              ✳
            </span>
            <span className="stage-spark spark-two" aria-hidden="true">
              +
            </span>
          </div>
        </div>
        <div className="home-hero-foot">
          <span />
          <button
            className="motion-toggle"
            onClick={() => {
              reset();
              setPaused(!paused);
            }}
            aria-pressed={paused}
          >
            {paused ? <Play size={13} /> : <Pause size={13} />}{" "}
            {paused ? "Ativar movimento" : "Pausar movimento"}
          </button>
        </div>
      </section>
      <div
        className="local-marquee"
        aria-label="Moda, casa, beleza e bons encontros, tudo por aqui"
      >
        <div className="marquee-track" aria-hidden="true">
          {[0, 1, 2, 3].map((n) => (
            <span key={n}>
              MODA <Sparkles /> CASA <Sparkles /> BELEZA <Sparkles /> ACESSÓRIOS{" "}
              <Sparkles /> CALÇADOS <Sparkles />
            </span>
          ))}
        </div>
      </div>
      <section className="home-discover">
        <div className="home-section-head">
          <div>
            <h2>Categorias</h2>
          </div>
          <button className="text-button" onClick={() => onExplore()}>
            Explorar tudo
            <ArrowUpRight size={18} />
          </button>
        </div>
        <div className="home-category-grid">
          {categories.map((c, i) => (
            <button
              key={c.name}
              className={"home-category category-" + i}
              onClick={() => onExplore(c.name)}
            >
              <div className="category-photo">
                {c.image && <img src={c.image} alt={c.name} />}
                <span>{c.tag}</span>
              </div>
              <div className="category-editorial">
                <h3>{c.title}</h3>
                <span className="category-circle">
                  <ArrowUpRight size={23} />
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="home-neighbors">
        <div className="home-section-head">
          <div>
            <h2>Lojas</h2>
          </div>
          <button className="text-button" onClick={onStores}>
            Todas as lojas
            <ArrowUpRight size={18} />
          </button>
        </div>
        <div className="store-grid">{stores.slice(0, 4).map(storeCard)}</div>
      </section>
    </div>
  );
}
