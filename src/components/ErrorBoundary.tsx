/**
 * Error boundary for game stages.
 *
 * The 3D stages need WebGL. If a browser (or an embedded preview pane) cannot
 * provide it, the learner must get a clear Kazakh message and a way out instead
 * of a blank screen. This boundary never hides a real error silently — it shows
 * the message and offers restart / back.
 */
import React from 'react';
import { AlertTriangle, RotateCcw, ChevronLeft } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  onReset?: () => void;
  label?: string;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // keep the technical detail in the console for developers, not in the UI
    console.error('[game stage crashed]', error.message, info.componentStack?.slice(0, 400));
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isWebgl = /webgl|three|context/i.test(error.message);

    return (
      <div className="glass-strong p-6 text-center">
        <AlertTriangle size={28} className="mx-auto text-gold mb-3" />
        <h2 className="font-display text-lg text-parchment">
          {isWebgl ? '3D көрініс іске қосылмады' : 'Ойын бөлігі іске қосылмады'}
        </h2>
        <p className="text-xs text-white/55 mt-2 max-w-md mx-auto leading-relaxed">
          {isWebgl
            ? 'Браузеріңіз WebGL-ді қолдамайды немесе ол өшірілген. Басқа браузерде ашып көріңіз (Chrome, Edge, Firefox) немесе құрылғының аппараттық үдеуін қосыңыз. Сұрақтарға жауап беру бөлігі бұған тәуелсіз жұмыс істейді.'
            : 'Бұл деңгейде күтпеген қате орын алды. Қайта бастап көріңіз.'}
        </p>
        <p className="text-[10px] text-white/30 mt-2 font-mono break-all">{error.message.slice(0, 160)}</p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <button className="btn btn-gold px-4 py-2 text-xs" onClick={this.reset}>
            <RotateCcw size={13} /> Қайта бастау
          </button>
          <a className="btn btn-ghost px-4 py-2 text-xs" href="/oyyndar">
            <ChevronLeft size={13} /> Ойындарға оралу
          </a>
        </div>
        {this.props.label && <p className="text-[10px] text-white/25 mt-3">{this.props.label}</p>}
      </div>
    );
  }
}
