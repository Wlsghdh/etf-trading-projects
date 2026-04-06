"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Send,
  Bot,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Brain,
  Sparkles,
  Zap,
  Wallet,
  CircleDot,
  CircleOff,
} from "lucide-react"
import {
  type AIModel,
  type ChatMessage,
  type StockAnalysis,
  type StockDataItem,
  fetchSymbols,
  fetchStockData,
  analyzeStock,
  fetchKISBalance,
  type KISBalance,
} from "@/lib/multi-ai-api"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts"

// ── AI 모델 설정 ──
const AI_MODELS: { id: AIModel; name: string; color: string; icon: typeof Bot }[] = [
  { id: "chatgpt", name: "ChatGPT", color: "bg-green-600", icon: Bot },
  { id: "gemini", name: "Gemini", color: "bg-blue-600", icon: Sparkles },
  { id: "claude", name: "Claude", color: "bg-orange-600", icon: Brain },
  { id: "multiai", name: "Multi AI", color: "bg-purple-600", icon: Zap },
]

// ── 분석 결과 카드 ──
function AnalysisCard({ analysis }: { analysis: StockAnalysis }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 my-3">
      {/* KIS 보유 정보 (실계좌) */}
      {analysis.holdingQty !== null && (
        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-green-500" />
              KIS 보유 현황
              {analysis.kisConnected ? (
                <CircleDot className="h-3 w-3 text-green-500 ml-auto" />
              ) : (
                <CircleOff className="h-3 w-3 text-red-500 ml-auto" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">보유 수량</span>
              <span className="font-mono font-semibold">{analysis.holdingQty}주</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">매수 평균가</span>
              <span className="font-mono">${analysis.avgBuyPrice?.toFixed(2) ?? "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">현재가</span>
              <span className="font-mono font-semibold">${analysis.currentPrice.toFixed(2)}</span>
            </div>
            {analysis.pnlRate !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">수익률</span>
                <span className={`font-mono font-semibold ${analysis.pnlRate >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {analysis.pnlRate >= 0 ? "+" : ""}{analysis.pnlRate.toFixed(2)}%
                </span>
              </div>
            )}
            {analysis.avgBuyPrice && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">평가금액</span>
                <span className="font-mono">
                  ${(analysis.currentPrice * (analysis.holdingQty ?? 0)).toFixed(2)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 최근 시장 동향 */}
      <Card className="border-blue-200 dark:border-blue-800">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            최근 시장 동향
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">현재가</span>
            <span className="font-mono font-semibold">${analysis.currentPrice.toFixed(2)}</span>
          </div>
          {[
            { label: "1일 변동", value: analysis.priceChange1d },
            { label: "5일 변동", value: analysis.priceChange5d },
            { label: "20일 변동", value: analysis.priceChange20d },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className={`font-mono ${value >= 0 ? "text-green-600" : "text-red-600"}`}>
                {value >= 0 ? "+" : ""}{value.toFixed(2)}%
              </span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-muted-foreground">RSI (14)</span>
            <span className={`font-mono ${
              analysis.rsi !== null
                ? analysis.rsi < 30 ? "text-green-600" : analysis.rsi > 70 ? "text-red-600" : ""
                : "text-muted-foreground"
            }`}>
              {analysis.rsi !== null ? analysis.rsi.toFixed(1) : "N/A"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">MACD</span>
            <span className={`font-mono ${
              analysis.macd !== null
                ? analysis.macd > 0 ? "text-green-600" : "text-red-600"
                : "text-muted-foreground"
            }`}>
              {analysis.macd !== null ? analysis.macd.toFixed(4) : "N/A"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">52주 범위</span>
            <span className="font-mono text-xs">${analysis.low52w.toFixed(0)} ~ ${analysis.high52w.toFixed(0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">거래량</span>
            <span className="font-mono text-xs">
              {(analysis.volume / 1_000_000).toFixed(1)}M
              <span className="text-muted-foreground ml-1">(avg {(analysis.avgVolume / 1_000_000).toFixed(1)}M)</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ML 분석 결과 */}
      <Card className="border-purple-200 dark:border-purple-800">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Brain className="h-4 w-4 text-purple-500" />
            ML 분석 결과 (피쳐 셀렉션)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-1.5 text-sm">
          {analysis.rank !== null ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">예측 방향</span>
                <Badge
                  variant={analysis.direction === "BUY" ? "default" : analysis.direction === "SELL" ? "destructive" : "secondary"}
                  className="text-xs"
                >
                  {analysis.direction === "BUY" && <TrendingUp className="h-3 w-3 mr-1" />}
                  {analysis.direction === "SELL" && <TrendingDown className="h-3 w-3 mr-1" />}
                  {analysis.direction === "HOLD" && <Minus className="h-3 w-3 mr-1" />}
                  {analysis.direction}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">종목 순위</span>
                <span className="font-mono font-semibold">
                  {analysis.rank}위 <span className="text-muted-foreground font-normal">/ {analysis.totalSymbols}개</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">모델 스코어</span>
                <span className="font-mono">{analysis.score?.toFixed(4)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">포지션 가중치</span>
                <span className={`font-mono ${
                  (analysis.weight ?? 0) > 0 ? "text-green-600" : (analysis.weight ?? 0) < 0 ? "text-red-600" : ""
                }`}>
                  {analysis.weight !== null ? (analysis.weight > 0 ? "+" : "") + analysis.weight.toFixed(3) : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">모델</span>
                <span className="font-mono text-xs">{analysis.modelName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">예측일</span>
                <span className="font-mono text-xs">
                  {analysis.predictionDate ? new Date(analysis.predictionDate).toLocaleDateString("ko-KR") : "N/A"}
                </span>
              </div>
              <div className="mt-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                LightGBM LambdaRank 85개 피쳐
                (기술지표 + 거시경제 + Z-score + 랭크)
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>ML 랭킹 데이터 없음</p>
              <p className="text-xs mt-1">예측을 먼저 실행해주세요</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── 미니 차트 ──
function MiniChart({ data, symbol }: { data: StockDataItem[]; symbol: string }) {
  const chartData = data.slice(-30).map(d => ({
    date: d.time.split("T")[0]?.slice(5) || d.time.slice(5),
    close: d.close,
  }))

  if (chartData.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center text-muted-foreground text-sm">
        차트 데이터 없음
      </div>
    )
  }

  const minPrice = Math.min(...chartData.map(d => d.close)) * 0.998
  const maxPrice = Math.max(...chartData.map(d => d.close)) * 1.002
  const priceChange = chartData[chartData.length - 1].close - chartData[0].close
  const isPositive = priceChange >= 0

  return (
    <div className="h-[120px]">
      <div className="flex items-center justify-between mb-1 px-1">
        <span className="text-xs font-semibold">{symbol}</span>
        <span className={`text-xs font-mono ${isPositive ? "text-green-600" : "text-red-600"}`}>
          ${chartData[chartData.length - 1].close.toFixed(2)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={95}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id={`miniGrad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
              <stop offset="100%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" hide />
          <YAxis domain={[minPrice, maxPrice]} hide />
          <Tooltip
            contentStyle={{ fontSize: "11px", padding: "4px 8px" }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "종가"]}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={isPositive ? "#22c55e" : "#ef4444"}
            strokeWidth={1.5}
            fill={`url(#miniGrad-${symbol})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── 채팅 메시지 버블 ──
function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user"
  const model = AI_MODELS.find(m => m.id === message.model)

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs ${
        isUser ? "bg-gray-500" : model?.color || "bg-gray-500"
      }`}>
        {isUser ? "U" : model?.name[0] || "A"}
      </div>
      <div className={`max-w-[85%] ${isUser ? "text-right" : ""}`}>
        {!isUser && (
          <span className="text-xs text-muted-foreground ml-1">{model?.name}</span>
        )}
        <div className={`rounded-lg px-3 py-2 text-sm ${
          isUser ? "bg-brand-primary text-white" : "bg-muted"
        }`}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        {message.analysisData && <AnalysisCard analysis={message.analysisData} />}
        <span className="text-[10px] text-muted-foreground ml-1">
          {message.timestamp.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  )
}

// ── 분석 요청 감지 ──
function detectAnalysisRequest(text: string): string | null {
  const patterns = [
    /([A-Za-z]{1,5})\s*분석/,
    /분석.*?([A-Za-z]{1,5})/,
    /([A-Za-z]{1,5})\s*어때/,
    /([A-Za-z]{1,5})\s*전망/,
    /analyze\s+([A-Za-z]{1,5})/i,
    /^([A-Za-z]{1,5})$/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const candidate = match[1].toUpperCase()
      if (candidate.length >= 1 && candidate.length <= 5) {
        return candidate
      }
    }
  }
  return null
}

// ── AI 응답 생성 (실데이터 기반) ──
function generateAnalysisResponse(analysis: StockAnalysis, model: AIModel): string {
  const { symbol, currentPrice, priceChange1d, rsi, macd, rank, direction, totalSymbols } = analysis

  const rsiStatus = rsi !== null
    ? rsi < 30 ? "과매도 구간 (매수 기회)" : rsi > 70 ? "과매수 구간 (조정 주의)" : "중립 구간"
    : "데이터 없음"

  const macdStatus = macd !== null
    ? macd > 0 ? "상승 모멘텀" : "하락 모멘텀"
    : "데이터 없음"

  const prefix: Record<AIModel, string> = {
    chatgpt: `[ChatGPT] ${symbol} 종합 분석 결과입니다.\n\n`,
    gemini: `[Gemini] ${symbol}에 대한 분석을 진행했습니다.\n\n`,
    claude: `[Claude] ${symbol} 분석 리포트입니다.\n\n`,
    multiai: `[Multi AI 종합] 3개 AI 관점을 종합한 ${symbol} 분석입니다.\n\n`,
  }

  let response = prefix[model]

  // KIS 보유 정보
  if (analysis.holdingQty !== null) {
    response += `보유 현황 (KIS 실계좌):\n`
    response += `• ${analysis.holdingQty}주 보유 중 (매수가 $${analysis.avgBuyPrice?.toFixed(2) ?? "N/A"})\n`
    if (analysis.pnlRate !== null) {
      response += `• 현재 수익률: ${analysis.pnlRate >= 0 ? "+" : ""}${analysis.pnlRate.toFixed(2)}%\n`
    }
    response += `\n`
  }

  response += `현재 ${symbol}은 $${currentPrice.toFixed(2)}에 거래 중이며, `
  response += `전일 대비 ${priceChange1d >= 0 ? "+" : ""}${priceChange1d.toFixed(2)}% 변동했습니다.\n\n`

  response += `기술적 분석:\n`
  response += `• RSI(14): ${rsi?.toFixed(1) ?? "N/A"} → ${rsiStatus}\n`
  response += `• MACD: ${macd?.toFixed(4) ?? "N/A"} → ${macdStatus}\n\n`

  if (rank !== null) {
    response += `ML 모델 분석 (LightGBM 85개 피쳐):\n`
    response += `• 종목 순위: ${rank}위 / ${totalSymbols}개 (${direction})\n`
    response += `• 52주 범위: $${analysis.low52w.toFixed(0)} ~ $${analysis.high52w.toFixed(0)}\n`
  }

  response += `\n아래 카드에서 상세 수치를 확인하세요.`

  return response
}

// ── 메인 페이지 ──
export default function MultiAIPage() {
  const [symbols, setSymbols] = useState<string[]>([])
  const [selectedSymbol, setSelectedSymbol] = useState<string>("")
  const [chartData, setChartData] = useState<StockDataItem[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [selectedModel, setSelectedModel] = useState<AIModel>("multiai")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [kisBalance, setKisBalance] = useState<KISBalance | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 초기 데이터 로드 (심볼 + KIS 잔고)
  useEffect(() => {
    Promise.all([
      fetchSymbols(),
      fetchKISBalance(),
    ]).then(([syms, balance]) => {
      setSymbols(syms)
      setKisBalance(balance)
      if (syms.length > 0 && !selectedSymbol) {
        setSelectedSymbol(syms[0])
      }
    }).catch(() => {})
  }, [])

  // 심볼 변경 시 차트 데이터 로드
  useEffect(() => {
    if (!selectedSymbol) return
    setChartLoading(true)
    fetchStockData(selectedSymbol, 60)
      .then(res => setChartData(res.data))
      .catch(() => setChartData([]))
      .finally(() => setChartLoading(false))
  }, [selectedSymbol])

  // 새 메시지 시 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isAnalyzing) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      model: selectedModel,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInputText("")

    // 분석 요청 감지
    const ticker = detectAnalysisRequest(text)
    if (ticker) {
      setIsAnalyzing(true)
      if (symbols.includes(ticker)) {
        setSelectedSymbol(ticker)
      }

      try {
        const analysis = await analyzeStock(ticker)
        const responseText = generateAnalysisResponse(analysis, selectedModel)

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: responseText,
          model: selectedModel,
          timestamp: new Date(),
          analysisData: analysis,
        }
        setMessages(prev => [...prev, assistantMsg])
      } catch {
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `${ticker} 분석 중 오류가 발생했습니다. ML 서비스 또는 Trading 서비스 상태를 확인해주세요.`,
          model: selectedModel,
          timestamp: new Date(),
        }
        setMessages(prev => [...prev, errorMsg])
      } finally {
        setIsAnalyzing(false)
      }
    } else {
      // 일반 메시지 안내
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `종목 분석을 원하시면 "AAPL 분석해줘" 또는 "NVDA 어때?" 형식으로 입력해주세요.\n\n현재 선택된 종목: ${selectedSymbol || "없음"}`,
        model: selectedModel,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    }
  }, [inputText, isAnalyzing, selectedModel, selectedSymbol, symbols])

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-4">
      {/* 상단: 티커+차트 | AI 선택+KIS 잔고 */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* 왼쪽: 티커 + 미니 차트 */}
        <Card className="flex-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Select value={selectedSymbol} onValueChange={(v) => v && setSelectedSymbol(v)}>
                <SelectTrigger className="w-36">
                  <SelectValue>{selectedSymbol || "종목 선택"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {symbols.map(sym => (
                    <SelectItem key={sym} value={sym}>{sym}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{symbols.length}개 종목</span>
              {/* KIS 연결 상태 */}
              {kisBalance && (
                <div className="ml-auto flex items-center gap-1 text-xs">
                  {kisBalance.kis_connected ? (
                    <>
                      <CircleDot className="h-3 w-3 text-green-500" />
                      <span className="text-green-600">KIS 연결</span>
                    </>
                  ) : (
                    <>
                      <CircleOff className="h-3 w-3 text-red-500" />
                      <span className="text-red-500">KIS 미연결</span>
                    </>
                  )}
                </div>
              )}
            </div>
            {chartLoading ? (
              <Skeleton className="h-[120px] w-full" />
            ) : (
              <MiniChart data={chartData} symbol={selectedSymbol} />
            )}
          </CardContent>
        </Card>

        {/* 오른쪽: AI 선택 + KIS 잔고 요약 */}
        <Card className="lg:w-80">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-medium">AI 모델 선택</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {AI_MODELS.map(model => (
                <Button
                  key={model.id}
                  variant={selectedModel === model.id ? "default" : "outline"}
                  size="sm"
                  className={`text-xs ${
                    selectedModel === model.id
                      ? `${model.color} text-white hover:opacity-90`
                      : ""
                  }`}
                  onClick={() => setSelectedModel(model.id)}
                >
                  <model.icon className="h-3.5 w-3.5 mr-1" />
                  {model.name}
                </Button>
              ))}
            </div>
            {/* KIS 잔고 요약 */}
            {kisBalance?.kis_connected && (
              <div className="border-t pt-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">가용 현금</span>
                  <span className="font-mono">${kisBalance.available_cash_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">총 평가</span>
                  <span className="font-mono">${kisBalance.total_evaluation_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">보유 종목</span>
                  <span className="font-mono">{kisBalance.holdings.length}개</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 채팅 영역 */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2 pt-3 px-4 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Bot className="h-4 w-4" />
              AI 분석 채팅
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {AI_MODELS.find(m => m.id === selectedModel)?.name}
            </Badge>
          </div>
        </CardHeader>

        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">멀티 AI 분석 플랫폼</p>
                <p className="text-xs mt-1">
                  종목명을 입력하면 KIS 실계좌 + ML 모델 기반 분석을 제공합니다
                </p>
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {["AAPL 분석해줘", "NVDA 어때?", "QQQ 전망"].map(example => (
                    <Button
                      key={example}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        setInputText(example)
                        inputRef.current?.focus()
                      }}
                    >
                      {example}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map(msg => (
              <ChatMessageBubble key={msg.id} message={msg} />
            ))}
            {isAnalyzing && (
              <div className="flex gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs ${
                  AI_MODELS.find(m => m.id === selectedModel)?.color
                }`}>
                  {AI_MODELS.find(m => m.id === selectedModel)?.name[0]}
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </ScrollArea>

        {/* 입력 */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={`${selectedSymbol || "종목"} 분석해줘...`}
              disabled={isAnalyzing}
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={!inputText.trim() || isAnalyzing} size="icon">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
