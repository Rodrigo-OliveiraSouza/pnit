import { Component, type ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    // Log to console for local debugging.
    console.error("UI error boundary:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <section className="empty-state">
            <span className="eyebrow">Erro</span>
            <h1>Falha ao carregar a interface</h1>
            <p>
              Atualize a página e verifique a chave do Google Maps ou o console
              do navegador.
            </p>
            {this.state.message && <p>{this.state.message}</p>}
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
