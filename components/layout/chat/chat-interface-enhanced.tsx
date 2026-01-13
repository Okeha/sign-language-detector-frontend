"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Wand2, Sparkles, Trash2, Loader2, SendIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { GlossPrediction } from "@/types/sign-language";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  prediction?: GlossPrediction;
  isLoading?: boolean;
}

interface ChatInterfaceEnhancedProps {
  predictions?: GlossPrediction[];
  sessionId?: string;
  backendUrl?: string;
  isStreaming?: boolean;
}

export default function ChatInterfaceEnhanced({
  predictions = [],
  sessionId = "",
  backendUrl = "http://localhost:8000",
  isStreaming = false,
}: ChatInterfaceEnhancedProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content:
        "Hello! I'm **Signrr**, your Sign Language Detection Assistant.\n\n Start the camera and begin streaming to begin a chat session. ",
      timestamp: new Date(),
    },
  ]);
  const [wordChoices, setWordChoices] = useState<string[][]>([]);
  const [interpretedSentence, setInterpretedSentence] = useState<string>("");
  const [inputText, setInputText] = useState<string>(""); // Manual input
  const [isConverting, setIsConverting] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastPredictionRef = useRef<string>("");
  const previousStreamingRef = useRef<boolean>(false);

  // Sync inputText with interpretedSentence or wordChoices
  useEffect(() => {
    if (isConverting) {
      setInputText("Interpreting...");
    } else if (interpretedSentence) {
      setInputText(interpretedSentence);
    } else if (wordChoices.length > 0) {
      setInputText(wordChoices.map((choices) => choices[0] || "").join(" "));
    }
  }, [wordChoices, interpretedSentence, isConverting]);

  // Debug: Log wordChoices whenever they change
  useEffect(() => {
    console.log("🔄 Word choices state updated:", wordChoices);
    console.log("📊 Current word positions:", wordChoices.length);
    console.log(
      "📝 Display value:",
      wordChoices.map((choices) => choices[0] || "").join(" ")
    );
    if (wordChoices.length > 0) {
      console.log(
        "📦 API Input Format:",
        JSON.stringify({ input: wordChoices }, null, 2)
      );
    }
  }, [wordChoices]);

  // Add word choices as predictions come in (only when streaming)
  useEffect(() => {
    console.log(
      "📥 [CHAT] Received predictions array. Length:",
      predictions.length,
      "isStreaming:",
      isStreaming
    );
    if (predictions.length > 0) {
      console.log("📥 [CHAT] Full predictions array:", predictions);
      const latestPrediction = predictions[predictions.length - 1];
      console.log("🔍 [CHAT] Latest prediction:", latestPrediction);
      console.log("🔍 [CHAT] Latest prediction details:", {
        gloss: latestPrediction.gloss,
        confidence: latestPrediction.confidence,
        top5: latestPrediction.top5,
        timestamp: latestPrediction.timestamp,
      });
    }

    if (predictions.length > 0 && isStreaming) {
      const latestPrediction = predictions[predictions.length - 1];

      // Avoid duplicates
      if (latestPrediction.gloss !== lastPredictionRef.current) {
        lastPredictionRef.current = latestPrediction.gloss;
        console.log("✅ Adding word choices:", latestPrediction.gloss);

        // Build choices array from top5 or just the main gloss
        const choices: string[] = latestPrediction.top5
          ? latestPrediction.top5.map(([word]) => word)
          : [latestPrediction.gloss];

        // Add to wordChoices array
        setWordChoices((prev) => {
          const newWordChoices = [...prev, choices];
          console.log("📝 Updated word choices array:", newWordChoices);
          return newWordChoices;
        });
      }
    }
  }, [predictions, isStreaming]);

  // Automatically interpret glosses when streaming stops
  useEffect(() => {
    // Detect when streaming transitions from true to false
    if (
      previousStreamingRef.current &&
      !isStreaming &&
      wordChoices.length > 0
    ) {
      console.log("⏹️ Streaming stopped - auto-interpreting glosses...");
      console.log("📤 Sending to /interpret-glosses:", { input: wordChoices });
      handleConvertToSentence();
    }
    previousStreamingRef.current = isStreaming;
  }, [isStreaming, wordChoices]);

  const handleConvertToSentence = async () => {
    if (wordChoices.length === 0) return;

    setIsConverting(true);
    try {
      const response = await fetch(`${backendUrl}/interpret-glosses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: wordChoices,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const sentence = data.sentence;

        // Store the interpreted sentence in state
        setInterpretedSentence(sentence);

        // Clear word choices after conversion
        setWordChoices([]);

        console.log("✨ Interpreted sentence:", sentence);
        console.log("📝 Sentence now displayed in input field");
      } else {
        console.error("Failed to interpret glosses:", response.statusText);
      }
    } catch (error) {
      console.error("Error interpreting glosses:", error);
    } finally {
      setIsConverting(false);
    }
  };

  const handleClearGlosses = async () => {
    setWordChoices([]);
    setInterpretedSentence("");
    setInputText("");
    lastPredictionRef.current = "";
    console.log("🗑️ Cleared word choices and interpreted sentence");
  };

  const handleSendGlosses = async () => {
    // Allow sending if we have text in the input
    if (!inputText || inputText === "Interpreting...") return;
    if (isWaitingForResponse) return; // Prevent multiple simultaneous requests
    if (isConverting) return; // Wait for interpretation to complete

    const content = inputText.trim();
    if (!content) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);

    // Clear state after adding to messages
    setWordChoices([]);
    setInterpretedSentence("");
    setInputText("");

    // Add loading message for AI response
    const loadingMessageId = `loading-${Date.now()}`;
    const loadingMessage: Message = {
      id: loadingMessageId,
      role: "assistant",
      content: "Thinking...",
      timestamp: new Date(),
      isLoading: true,
    };
    setMessages((prev) => [...prev, loadingMessage]);
    setIsWaitingForResponse(true);

    try {
      // Call the /chat endpoint
      const response = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("🤖 AI Response:", data);

      // Remove loading message and add actual response
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== loadingMessageId);
        const aiMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: data.response,
          timestamp: new Date(data.timestamp || Date.now()),
        };
        return [...filtered, aiMessage];
      });
    } catch (error) {
      console.error("❌ Error calling /chat endpoint:", error);

      // Remove loading message and show error
      setMessages((prev) => {
        const filtered = prev.filter((msg) => msg.id !== loadingMessageId);
        const errorMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content:
            "Sorry, I encountered an error processing your request. Please try again.",
          timestamp: new Date(),
        };
        return [...filtered, errorMessage];
      });
    } finally {
      setIsWaitingForResponse(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (e.shiftKey) {
        handleConvertToSentence();
      } else {
        handleSendGlosses();
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-background rounded-xl border shadow-sm">
      {/* Chat Header */}
      <div className="border-b p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Sign Language Assistant</h2>
            <p className="text-sm text-muted-foreground">
              Powered by AI • Real-time detection
            </p>
          </div>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            {wordChoices.length} words
          </Badge>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4 max-h-[800px]" ref={scrollAreaRef}>
        <div className="space-y-4 pb-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    AI
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {message.isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">{message.content}</span>
                  </div>
                ) : message.role === "assistant" ? (
                  <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm">{message.content}</p>
                )}
                <span className="text-xs opacity-70 mt-1 block">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {message.role === "user" && (
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-secondary">U</AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-2 flex-shrink-0">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Detected signs will appear here or type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isConverting}
            className="flex-1"
          />
          <Button
            onClick={handleSendGlosses}
            size="icon"
            disabled={
              !inputText ||
              inputText === "Interpreting..." ||
              isWaitingForResponse ||
              isConverting
            }
            title="Send to chat"
          >
            {isWaitingForResponse ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
          <Button
            onClick={handleClearGlosses}
            size="icon"
            variant="outline"
            disabled={
              wordChoices.length === 0 && !interpretedSentence && !inputText
            }
            title="Clear all"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleConvertToSentence}
            size="icon"
            variant="secondary"
            disabled={
              wordChoices.length === 0 ||
              isConverting ||
              interpretedSentence !== ""
            }
            title="Re-interpret with AI (auto-runs on stream stop)"
          >
            {isConverting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
