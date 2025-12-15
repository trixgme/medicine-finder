// 테스트 스크립트 - 캐시 상태 확인 및 직접 이미지 API 테스트

async function testImageAPI() {
  const baseUrl = 'http://localhost:3000';

  // 1. 캐시 상태 확인
  console.log('=== 캐시 상태 확인 ===');
  try {
    const cacheResponse = await fetch(`${baseUrl}/api/medicine-image`, {
      method: 'POST'
    });
    const cacheData = await cacheResponse.json();
    console.log('현재 캐시:', cacheData);
  } catch (error) {
    console.error('캐시 확인 실패:', error);
  }

  // 2. 직접 이미지 API 테스트
  console.log('\n=== 이미지 API 테스트 ===');
  const testMedicines = ['타이레놀', '부루펜', '게보린'];

  for (const medicine of testMedicines) {
    console.log(`\n테스트: ${medicine}`);
    try {
      const response = await fetch(
        `${baseUrl}/api/medicine-image?name=${encodeURIComponent(medicine)}`
      );
      const data = await response.json();
      console.log('응답:', {
        ...data,
        imageUrl: data.imageUrl ?
          (data.imageUrl.substring(0, 100) + '...') :
          null
      });
    } catch (error) {
      console.error(`에러 (${medicine}):`, error);
    }

    // Rate limiting 준수 (1초 대기)
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
}

// 실행
testImageAPI();