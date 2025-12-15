import ChatInterface from '@/components/chat-interface';

export default function Home() {
  return (
    <main className="container mx-auto p-4 min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-rose-50 to-white dark:from-gray-900 dark:to-gray-800">
      <div className="w-full max-w-6xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent mb-2">
            약국 도우미 AI
          </h1>
          <p className="text-muted-foreground">
            증상을 말씀해주시면 적절한 약을 추천해드립니다
          </p>
        </div>
        <ChatInterface />
      </div>
    </main>
  );
}
