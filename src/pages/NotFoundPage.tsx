import { Link } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <Compass size={40} className="mx-auto text-gold/60 mb-4" />
      <h1 className="font-display text-4xl text-parchment">404</h1>
      <p className="text-sm text-white/50 mt-2">Бұл бет табылмады. Шежіреде бұл жол жоқ сияқты.</p>
      <Link to="/" className="btn btn-gold px-5 py-2.5 text-sm mt-6 inline-flex">
        <Home size={15} /> Басты бетке
      </Link>
    </div>
  );
}
