import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import PQueue from 'p-queue';

// Rate limiting: 초당 1회 요청
const queue = new PQueue({
  concurrency: 1,
  interval: 1000, // 1초
  intervalCap: 1  // 1초에 1개 요청만
});

// User-Agent 로테이션
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// 메모리 캐시 (24시간)
interface CacheEntry {
  imageUrl: string | null;
  timestamp: number;
}

const imageCache = new Map<string, CacheEntry>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간

// 랜덤 User-Agent 선택
function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// 캐시 확인
function checkCache(medicineName: string): string | null {
  const cached = imageCache.get(medicineName);
  if (cached) {
    const isExpired = Date.now() - cached.timestamp > CACHE_DURATION;
    if (!isExpired) {
      console.log(`[Cache Hit] ${medicineName}`);
      return cached.imageUrl;
    } else {
      imageCache.delete(medicineName);
    }
  }
  return null;
}

// 캐시 저장
function saveToCache(medicineName: string, imageUrl: string | null): void {
  imageCache.set(medicineName, {
    imageUrl,
    timestamp: Date.now()
  });
  console.log(`[Cache Saved] ${medicineName}`);
}

// 구글 이미지 검색 크롤링
async function crawlGoogleImage(medicineName: string): Promise<string | null> {
  try {
    console.log(`[Crawling Start] ${medicineName}`);

    const searchQuery = encodeURIComponent(`${medicineName} 약`);
    const searchUrl = `https://www.google.com/search?udm=2&q=${searchQuery}&hl=ko`;

    const headers = {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Cache-Control': 'no-cache',
      'Referer': 'https://www.google.com/'
    };

    console.log(`[Fetching] ${searchUrl}`);
    console.log(`[User-Agent] ${headers['User-Agent']}`);

    const response = await fetch(searchUrl, {
      method: 'GET',
      headers,
      redirect: 'follow'
    });

    if (!response.ok) {
      console.error(`[Fetch Error] Status: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 디버깅: 모든 이미지 태그 출력
    console.log(`[Debug] Total images found: ${$('img').length}`);

    let imageUrl: string | null = null;
    const validImages: string[] = [];

    // 모든 이미지를 검사하여 유효한 이미지 찾기
    $('img').each((i, elem) => {
      const src = $(elem).attr('src');
      const dataSrc = $(elem).attr('data-src');
      const alt = $(elem).attr('alt');
      const width = $(elem).attr('width');
      const height = $(elem).attr('height');

      // 디버깅 정보
      if (i < 15) { // 처음 15개만 로그
        console.log(`[Debug] Image ${i}:`, {
          src: src?.substring(0, 80),
          dataSrc: dataSrc?.substring(0, 80),
          alt: alt?.substring(0, 50),
          width,
          height
        });
      }

      const imgUrl = dataSrc || src;

      // 유효한 이미지 필터링
      // 1x1 픽셀 이미지나 placeholder 제외
      const isPlaceholder = imgUrl?.includes('R0lGODlhAQABAIAAAP') ||
                          (width === '1' && height === '1') ||
                          imgUrl?.includes('data:image/gif;base64,R0lGODlhAQABAIAAAP');

      if (imgUrl &&
          !isPlaceholder &&
          !imgUrl.includes('/logos/') &&
          !imgUrl.includes('google.com/images/branding') &&
          !imgUrl.includes('gstatic.com/images/icons') &&
          (imgUrl.startsWith('http') ||
           imgUrl.startsWith('//') ||
           (imgUrl.startsWith('data:image') && imgUrl.length > 200))) { // base64는 200자 이상만

        // https 추가
        const fullUrl = imgUrl.startsWith('//') ? 'https:' + imgUrl : imgUrl;
        validImages.push(fullUrl);
      }
    });

    console.log(`[Debug] Valid images found: ${validImages.length}`);
    if (validImages.length > 0) {
      console.log('[Debug] First 3 valid images:', validImages.slice(0, 3).map(url => url.substring(0, 100)));
    }

    // 첫 번째 유효한 이미지 선택
    if (validImages.length > 0) {
      imageUrl = validImages[0];
      console.log(`[Image Selected] ${medicineName}: ${imageUrl.substring(0, 150)}`);
    }

    // 이미지를 못 찾은 경우 encrypted-tbn URL 찾기 (구글 썸네일)
    if (!imageUrl) {
      const encryptedImages = $('img[src*="encrypted-tbn"]');
      console.log(`[Debug] Encrypted images found: ${encryptedImages.length}`);

      encryptedImages.each((i, elem) => {
        if (imageUrl) return false;

        const src = $(elem).attr('src');
        const width = $(elem).attr('width');
        const height = $(elem).attr('height');

        // 크기가 있는 이미지만 선택
        if (src && (!width || parseInt(width) > 50) && (!height || parseInt(height) > 50)) {
          imageUrl = src.startsWith('//') ? 'https:' + src : src;
          console.log(`[Encrypted Image Found] ${imageUrl.substring(0, 100)}`);
          return false;
        }
      });
    }

    // g-img 태그 내부의 img 찾기 (구글의 새로운 구조)
    if (!imageUrl) {
      const gImg = $('g-img img').filter((i, elem) => {
        const src = $(elem).attr('src') || $(elem).attr('data-src');
        return !!(src && !src.includes('R0lGODlhAQABAIAAAP'));
      }).first();

      if (gImg.length > 0) {
        const src = gImg.attr('data-src') || gImg.attr('src');
        imageUrl = src?.startsWith('//') ? 'https:' + src : (src || null);
        console.log(`[g-img Found] ${imageUrl?.substring(0, 100)}`);
      }
    }

    // Script 태그에서 이미지 찾기
    if (!imageUrl) {
      console.log(`[No Valid Image Found in IMG tags] ${medicineName}`);
      console.log('[Searching in Script tags...]');

      // HTML에서 script 태그 내의 이미지 URL 찾기
      const scriptContent = $('script').text();
      const imageMatches = scriptContent.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|gif|webp)/gi);

      if (imageMatches && imageMatches.length > 0) {
        console.log(`[Script Images Found] ${imageMatches.length} images in scripts`);

        // 제외할 도메인/패턴
        const excludePatterns = [
          'logo', 'icon', 'banner', 'ads', 'advertisement',
          'google.com', 'gstatic.com', 'googleusercontent.com',
          'youtube.com', 'ytimg.com', 'facebook', 'twitter',
          '1x1', 'pixel', 'tracking', 'analytics',
          'example.com', 'test.com', 'placeholder', 'dummy'
        ];

        // 우선순위가 높은 도메인/패턴
        const priorityPatterns = [
          'ctfassets.net',      // Contentful CDN (타이레놀 공식)
          'whosaeng.com',       // 후생신보
          'k-health.com',       // 헬스경향
          'namu.wiki',          // 나무위키
          'kpanews.co.kr',      // 약사공론
          'mfds.go.kr',         // 식약처
          'nedrug.mfds.go.kr',  // 의약품안전나라
          'health.kr',
          'pharmnews',
          'medical',
          'pharm'
        ];

        // 1차: 우선순위 패턴에 매칭되는 이미지
        const priorityImages = imageMatches.filter(url => {
          const lowerUrl = url.toLowerCase();
          const hasExcludePattern = excludePatterns.some(pattern => lowerUrl.includes(pattern));
          const hasPriorityPattern = priorityPatterns.some(pattern => lowerUrl.includes(pattern));
          return !hasExcludePattern && hasPriorityPattern;
        });

        if (priorityImages.length > 0) {
          imageUrl = priorityImages[0];
          console.log(`[Priority Image Selected] ${imageUrl.substring(0, 150)}`);
        } else {
          // 2차: 제외 패턴만 없는 일반 이미지
          const generalImages = imageMatches.filter(url => {
            const lowerUrl = url.toLowerCase();
            return !excludePatterns.some(pattern => lowerUrl.includes(pattern));
          });

          if (generalImages.length > 0) {
            imageUrl = generalImages[0];
            console.log(`[General Image Selected] ${imageUrl.substring(0, 150)}`);
          } else if (imageMatches.length > 0) {
            // 3차: 아무 이미지나 사용
            imageUrl = imageMatches[0];
            console.log(`[Fallback Image Used] ${imageUrl.substring(0, 150)}`);
          }
        }

        // 디버깅: 찾은 이미지 URL 목록 출력
        if (priorityImages.length > 0) {
          console.log(`[Debug] Priority images (${priorityImages.length}):`,
            priorityImages.slice(0, 3).map(url => url.substring(0, 80)));
        }
      }
    }

    if (imageUrl) {
      console.log(`[Final Image] ${medicineName}: ${imageUrl.substring(0, 150)}`);

      // base64 이미지인 경우 크기 체크
      if (imageUrl.startsWith('data:image')) {
        const base64Length = imageUrl.length;
        console.log(`[Base64 Image Size] ${base64Length} characters`);
        if (base64Length < 200) {
          console.log('[Warning] Base64 image too small, likely a placeholder');
          return null;
        }
      }

      // URL 유효성 검증 (http/https로 시작하는 경우)
      if (imageUrl.startsWith('http')) {
        try {
          const urlObj = new URL(imageUrl);

          // example.com, test.com 등 테스트 도메인 제외
          const invalidDomains = ['example.com', 'example.org', 'example.net', 'test.com', 'localhost'];
          if (invalidDomains.some(domain => urlObj.hostname.includes(domain))) {
            console.log(`[Invalid Domain] ${urlObj.hostname} - skipping`);
            return null;
          }

          console.log(`[Valid URL] ${urlObj.hostname}`);
        } catch (error) {
          console.log(`[Invalid URL Format] ${imageUrl}`);
          return null;
        }
      }
    } else {
      console.log(`[No Image Found At All] ${medicineName}`);
    }

    return imageUrl;
  } catch (error) {
    console.error(`[Crawl Error] ${medicineName}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const medicineName = request.nextUrl.searchParams.get('name');

    if (!medicineName) {
      return NextResponse.json(
        { error: '약품명이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`\n[API Request] ${medicineName}`);
    console.log('='.repeat(50));

    // 1. 캐시 확인
    const cachedImage = checkCache(medicineName);
    if (cachedImage !== null) {
      return NextResponse.json({
        imageUrl: cachedImage,
        source: 'cache'
      });
    }

    // 2. Rate limiting 적용하여 크롤링
    const imageUrl = await queue.add(async () => {
      return await crawlGoogleImage(medicineName);
    });

    // 3. 캐시에 저장
    saveToCache(medicineName, imageUrl);

    console.log('='.repeat(50) + '\n');

    return NextResponse.json({
      imageUrl: imageUrl,
      source: 'crawled'
    });
  } catch (error) {
    console.error('[API Error]:', error);
    return NextResponse.json(
      { error: '이미지를 가져오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// 캐시 상태 확인 및 관리 API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'clear') {
      // 캐시 전체 삭제
      const size = imageCache.size;
      imageCache.clear();
      console.log(`[Cache Cleared] ${size} entries deleted`);
      return NextResponse.json({ message: 'Cache cleared', deletedCount: size });
    }

    if (action === 'delete' && body.medicineName) {
      // 특정 약품 캐시 삭제
      const existed = imageCache.has(body.medicineName);
      imageCache.delete(body.medicineName);
      console.log(`[Cache Deleted] ${body.medicineName}: ${existed ? 'existed' : 'not found'}`);
      return NextResponse.json({ message: 'Cache entry deleted', existed });
    }

    // 캐시 상태 확인 (기본)
    const cacheStatus = {
      size: imageCache.size,
      entries: Array.from(imageCache.entries()).map(([key, value]) => ({
        medicine: key,
        hasImage: !!value.imageUrl,
        imagePreview: value.imageUrl ? value.imageUrl.substring(0, 100) : null,
        age: Math.floor((Date.now() - value.timestamp) / 1000 / 60) + ' minutes'
      }))
    };

    return NextResponse.json(cacheStatus);
  } catch (error) {
    console.error('[Cache API Error]:', error);
    return NextResponse.json(
      { error: 'Failed to process cache request' },
      { status: 500 }
    );
  }
}