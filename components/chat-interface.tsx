'use client';

import { useState, useRef, useEffect } from 'react';
import { Message, ApiResponse } from '@/types/chat';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send, Bot, User, AlertTriangle, Pill, AlertCircle, Clock, Heart } from 'lucide-react';
import Image from 'next/image';

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // 초기 메시지 설정
  useEffect(() => {
    const initialMessage: Message = {
      id: '1',
      role: 'assistant',
      content: '안녕하세요! 약국 도우미입니다. 어디가 불편하신가요? 증상을 자세히 설명해주시면 적절한 약을 추천해드릴게요.',
      timestamp: new Date(),
    };
    setMessages([initialMessage]);
  }, []);

  // 스크롤을 맨 아래로 이동
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      const data: ApiResponse = await response.json();

      if ((data as any).error) {
        throw new Error((data as any).error);
      }

      // 응답 데이터를 읽기 쉬운 텍스트로 변환
      let contentText = '';

      if (data.greeting) {
        contentText = data.greeting + '\n\n';
      }

      if (data.needHospital && data.hospitalReason) {
        contentText += `⚠️ **병원 방문 권유**\n${data.hospitalReason}\n\n`;
      }

      if (data.additionalAdvice) {
        contentText += `💡 ${data.additionalAdvice}`;
      }

      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: contentText || '약품 정보를 확인해주세요.',
        apiResponse: data,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '죄송합니다. 응답을 생성하는 중에 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderAssistantMessage = (message: Message) => {
    if (!message.apiResponse) {
      return <p className="text-sm whitespace-pre-wrap">{message.content}</p>;
    }

    const { greeting, medicines, additionalAdvice, needHospital, hospitalReason } = message.apiResponse;

    return (
      <div className="space-y-3">
        {greeting && (
          <p className="text-sm">{greeting}</p>
        )}

        {needHospital && hospitalReason && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 dark:text-red-200 text-sm">병원 방문 필요</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{hospitalReason}</p>
              </div>
            </div>
          </div>
        )}

        {medicines && medicines.length > 0 && (
          <div className="space-y-3">
            <p className="font-semibold text-sm">추천 약품:</p>
            {medicines.map((medicine, index) => (
              <Card key={index} className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {/* 약품명 헤더 */}
                    <div className="flex items-center gap-2 justify-center mb-4">
                      <Pill className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <h4 className="font-bold text-xl text-blue-900 dark:text-blue-100">{medicine.name}</h4>
                    </div>

                    {/* 큰 이미지 */}
                    {medicine.imageUrl && (
                      <div className="flex justify-center mb-4">
                        <div className="relative bg-white rounded-xl shadow-xl p-4">
                          <Image
                            src={medicine.imageUrl}
                            alt={medicine.name}
                            width={300}
                            height={300}
                            className="rounded-lg object-contain max-h-[300px]"
                            unoptimized
                          />
                        </div>
                      </div>
                    )}

                    {/* 약품 정보 */}
                    <div className="space-y-2.5 text-base">
                      <div className="flex gap-3">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 min-w-[70px]">성분:</span>
                        <span className="text-gray-800 dark:text-gray-200">{medicine.ingredients}</span>
                      </div>

                      <div className="flex gap-3">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 min-w-[70px]">효능:</span>
                        <span className="text-gray-800 dark:text-gray-200">{medicine.effects}</span>
                      </div>

                      <div className="flex gap-3">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 min-w-[70px]">복용법:</span>
                        <span className="text-gray-800 dark:text-gray-200">{medicine.dosage}</span>
                      </div>

                      <div className="flex gap-3 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                        <span className="text-amber-800 dark:text-amber-200 font-medium">{medicine.cautions}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {additionalAdvice && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Heart className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5" />
              <p className="text-sm text-green-800 dark:text-green-200">{additionalAdvice}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="w-full max-w-4xl mx-auto h-[80vh] flex flex-col">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-6 h-6" />
          약국 도우미 AI
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea ref={scrollAreaRef} className="h-full p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[85%] ${
                    message.role === 'user' ? 'order-1' : 'order-2'
                  }`}
                >
                  {message.role === 'user' ? (
                    <div className="rounded-lg px-4 py-2 bg-primary text-primary-foreground">
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {renderAssistantMessage(message)}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(message.timestamp).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                {message.role === 'user' && (
                  <Avatar className="w-8 h-8">
                    <AvatarFallback>
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <Avatar className="w-8 h-8">
                  <AvatarFallback>
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-muted rounded-lg px-4 py-2">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="border-t p-4">
        <div className="flex w-full gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="증상을 입력해주세요..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}