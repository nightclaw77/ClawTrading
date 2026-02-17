'use client';

import { useState, useEffect } from 'react';
import { Newspaper, ExternalLink } from 'lucide-react';

interface NewsItem {
  title: string;
  description: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: {
    score: number;
    classification: string;
  };
}

export default function NewsPanel() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchNews = async () => {
    try {
      const res = await fetch('/api/news');
      if (res.ok) {
        const data = await res.json();
        setNews(data.news || []);
      }
    } catch (e) {
      console.error('Failed to fetch news:', e);
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColor = (classification: string) => {
    switch (classification) {
      case 'Bullish': return 'text-green-400 bg-green-500/20';
      case 'Bearish': return 'text-red-400 bg-red-500/20';
      default: return 'text-slate-400 bg-slate-700';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000 / 60);
    
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Newspaper className="w-5 h-5 text-blue-400" />
          <h2 className="font-semibold">Crypto News</h2>
        </div>
        <span className="text-xs text-slate-500">Live</span>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse p-3 bg-slate-800 rounded-lg">
                <div className="h-4 bg-slate-700 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-slate-700 rounded w-1/2"></div>
              </div>
            ))}
          </>
        ) : news.length > 0 ? (
          news.map((item, idx) => (
            <a
              key={idx}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors group"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium line-clamp-2 group-hover:text-blue-400 transition-colors">
                  {item.title}
                </h3>
                <ExternalLink className="w-3 h-3 text-slate-500 flex-shrink-0 mt-1" />
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-2 py-0.5 rounded ${getSentimentColor(item.sentiment?.classification)}`}>
                  {item.sentiment?.classification || 'Neutral'}
                </span>
                <span className="text-xs text-slate-500">{item.source}</span>
                <span className="text-xs text-slate-500">{formatTime(item.published_at)}</span>
              </div>
            </a>
          ))
        ) : (
          <div className="text-center py-8 text-slate-500">
            <p>No news available</p>
          </div>
        )}
      </div>
    </div>
  );
}
