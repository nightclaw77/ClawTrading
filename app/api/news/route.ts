import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Try multiple news sources
    let news = [];
    
    // Try CryptoPanic
    try {
      const response = await fetch(
        'https://cryptopanic.com/api/free/v1/posts/?auth_token=&public=true&currencies=BTC',
        { signal: AbortSignal.timeout(5000) }
      );
      
      if (response.ok) {
        const data = await response.json();
        news = data.results?.slice(0, 10).map((item: any) => ({
          title: item.title,
          description: item.metadata?.description || '',
          url: item.url,
          source: item.source?.title || 'CryptoPanic',
          published_at: item.published_at,
          sentiment: analyzeSentiment(item.title + ' ' + (item.metadata?.description || ''))
        })) || [];
      }
    } catch (e) {
      console.log('CryptoPanic fetch failed, trying fallback');
    }

    // Fallback to CoinGecko if CryptoPanic fails
    if (news.length === 0) {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/news',
          { signal: AbortSignal.timeout(5000) }
        );
        
        if (response.ok) {
          const data = await response.json();
          news = data.data?.slice(0, 10).map((item: any) => ({
            title: item.title,
            description: item.description?.substring(0, 200) + '...' || '',
            url: item.url,
            source: item.source || 'CoinGecko',
            published_at: item.updated_at || new Date().toISOString(),
            sentiment: analyzeSentiment(item.title + ' ' + item.description)
          })) || [];
        }
      } catch (e) {
        console.log('CoinGecko fetch failed');
      }
    }

    return NextResponse.json({
      news,
      count: news.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('News API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news', news: [] },
      { status: 500 }
    );
  }
}

function analyzeSentiment(text: string) {
  const bullish = ['bull', 'surge', 'rally', 'moon', 'pump', 'breakout', 'high', 'gain', 'up', 'rise', 'growth'];
  const bearish = ['bear', 'crash', 'dump', 'fall', 'drop', 'loss', 'down', 'decline', 'fud', 'bearish'];
  
  const lowerText = text.toLowerCase();
  let score = 50;
  
  bullish.forEach(word => { if (lowerText.includes(word)) score += 5; });
  bearish.forEach(word => { if (lowerText.includes(word)) score -= 5; });
  
  score = Math.max(0, Math.min(100, score));
  
  let classification = 'Neutral';
  if (score >= 60) classification = 'Bullish';
  else if (score <= 40) classification = 'Bearish';
  
  return { score, classification };
}
