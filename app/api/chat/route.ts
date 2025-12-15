import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 약품 정보를 담은 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 한국의 약국에서 일하는 전문 약사입니다.
사용자의 증상을 듣고 적절한 일반의약품(처방전 없이 구매 가능한 약)을 추천해주세요.

다음 지침을 따라주세요:
1. 친절하고 공감적인 태도로 대화하세요
2. 증상에 따른 적절한 일반의약품을 2-3개 추천해주세요
3. 심각한 증상이나 응급상황으로 보이면 병원 방문을 권유하세요
4. 불법 약품이나 처방전이 필요한 약품은 절대 추천하지 마세요

반드시 다음 JSON 형식으로 응답하세요:
{
  "greeting": "공감적인 인사말 (선택사항)",
  "medicines": [
    {
      "name": "약품명",
      "ingredients": "주요 성분",
      "effects": "효능/효과",
      "dosage": "복용법",
      "cautions": "주의사항",
      "imageUrl": "약품 이미지 URL (선택사항)"
    }
  ],
  "additionalAdvice": "추가 조언이나 주의사항 (선택사항)",
  "needHospital": false,  // 병원 방문이 필요한 경우 true
  "hospitalReason": "병원 방문이 필요한 이유 (needHospital이 true인 경우)"
}

예시 응답:
{
  "greeting": "머리가 아프시군요. 정말 힘드시겠어요.",
  "medicines": [
    {
      "name": "타이레놀",
      "ingredients": "아세트아미노펜 500mg",
      "effects": "두통, 발열, 근육통 완화",
      "dosage": "1회 1-2정, 1일 3-4회, 4-6시간 간격",
      "cautions": "간 질환자는 주의, 음주 시 복용 금지",
      "imageUrl": "https://example.com/tylenol.jpg"
    },
    {
      "name": "부루펜",
      "ingredients": "이부프로펜 400mg",
      "effects": "두통, 치통, 생리통, 관절통 완화",
      "dosage": "1회 1정, 1일 3회, 식후 복용",
      "cautions": "위장장애 가능, 공복 복용 피하기",
      "imageUrl": null
    }
  ],
  "additionalAdvice": "충분한 휴식과 수분 섭취를 하시고, 증상이 3일 이상 지속되면 병원을 방문하세요.",
  "needHospital": false
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    // OpenAI API 호출
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map((msg: any) => ({
          role: msg.role,
          content: msg.content,
        })),
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;

    if (!responseContent) {
      throw new Error('응답을 생성할 수 없습니다.');
    }

    // JSON 응답 로그 출력
    console.log('=== OpenAI Raw Response ===');
    console.log(responseContent);
    console.log('===========================');

    // JSON 파싱
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
      console.log('=== Parsed JSON Response ===');
      console.log(JSON.stringify(parsedResponse, null, 2));
      console.log('============================');
    } catch (parseError) {
      console.error('JSON 파싱 실패:', parseError);
      // JSON 파싱 실패 시 기본 형식으로 응답
      parsedResponse = {
        content: responseContent,
        image: null,
      };
    }

    // 약품 이미지 자동으로 가져오기
    if (parsedResponse.medicines && Array.isArray(parsedResponse.medicines)) {
      console.log('=== Fetching medicine images ===');

      // 각 약품에 대해 이미지 가져오기 (순차적으로 실행)
      for (let medicine of parsedResponse.medicines) {
        if (medicine.name && !medicine.imageUrl) {
          try {
            console.log(`Fetching image for: ${medicine.name}`);
            const imageResponse = await fetch(
              `${request.nextUrl.origin}/api/medicine-image?name=${encodeURIComponent(medicine.name)}`,
              { method: 'GET' }
            );

            if (imageResponse.ok) {
              const { imageUrl } = await imageResponse.json();
              medicine.imageUrl = imageUrl;
              console.log(`Image found for ${medicine.name}: ${imageUrl?.substring(0, 50)}...`);
            }
          } catch (error) {
            console.error(`Failed to fetch image for ${medicine.name}:`, error);
          }
        }
      }
    }

    // 새로운 JSON 형식을 그대로 전달
    console.log('=== Final Response to Client ===');
    console.log(JSON.stringify(parsedResponse, null, 2));
    console.log('=================================');

    return NextResponse.json(parsedResponse);
  } catch (error: any) {
    console.error('API Error:', error);

    // OpenAI API 에러 처리
    if (error.status === 401) {
      return NextResponse.json(
        { error: 'OpenAI API 키가 유효하지 않습니다.' },
        { status: 401 }
      );
    }

    if (error.status === 429) {
      return NextResponse.json(
        { error: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: '응답을 생성하는 중에 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}