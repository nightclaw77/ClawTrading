import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Fetch from alternative.me Fear & Greed Index
    const response = await fetch(
      'https://api.alternative.me/fng/',
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch Fear & Greed');
    }

    const data = await response.json();
    
    if (data.data && data.data.length > 0) {
      const item = data.data[0];
      
      const value = parseInt(item.value);
      let emoji = '😐';
      let color = 'text-yellow-500';
      
      if (value <= 20) { emoji = '😱'; color = 'text-red-600'; }
      else if (value <= 40) { emoji = '😰'; color = 'text-orange-500'; }
      else if (value <= 60) { emoji = '😐'; color = 'text-yellow-500'; }
      else if (value <= 80) { emoji = '😏'; color = 'text-green-500'; }
      else { emoji = '🤑'; color = 'text-green-600'; }

      return NextResponse.json({
        value: value,
        classification: item.value_classification,
        classification_translated: translateClassification(item.value_classification),
        emoji,
        color,
        timestamp: new Date(item.timestamp * 1000).toISOString(),
        source: 'alternative.me'
      });
    }

    throw new Error('Invalid response format');
  } catch (error) {
    console.error('Fear & Greed API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch Fear & Greed', 
        value: 50,
        classification: 'Neutral',
        emoji: '😐',
        color: 'text-yellow-500'
      },
      { status: 500 }
    );
  }
}

function translateClassification(classification: string): string {
  const translations: Record<string, string> = {
    'Extreme Fear': 'Extreme Fear',
    'Fear': 'Fear',
    'Neutral': 'Neutral',
    'Greed': 'Greed',
    'Extreme Greed': 'Extreme Greed'
  };
  return translations[classification] || classification;
}
