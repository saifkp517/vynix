'use client'
import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Editor from '@monaco-editor/react';
import { io, Socket } from 'socket.io-client';
import CodeExecutor from '../utils/codeExecutor';
import { Code, CheckCircle, X, Eye, EyeOff, Crown, AlertTriangle, MessageCircle, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '../utils/AuthContext';


const CodeBattleArena = () => {
  // Sample problem statements - in a real app, these would come from an API
  const problemStatements = [
    {
      id: 'max-subarray',
      title: 'Maximum Subarray',
      difficulty: 'Medium',
      description: `
        Given an array of integers, find the contiguous subarray with the largest sum and return both the sum and the subarray.

        Input:
        [-2, 1, -3, 4, -1, 2, 1, -5, 4]

        Expected Output:
        Sum: 6
        Subarray: [4, -1, 2, 1]

        Constraints:
        The array length will be between 1 and 10,000
        Time complexity must be O(n)
        Space complexity must be O(1) excluding the output

        Bonus points for clean code and efficient edge case handling.
      `
    },
    {
      id: 'two-sum',
      title: 'Two Sum',
      difficulty: 'Easy',
      description: `
        Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.
        You may assume that each input would have exactly one solution, and you may not use the same element twice.

        Input:
        nums = [2, 7, 11, 15], target = 9

        Expected Output:
        [0, 1]

        Constraints:
        2 <= nums.length <= 10^4
        -10^9 <= nums[i] <= 10^9
        -10^9 <= target <= 10^9
        Only one valid answer exists.
      `
    }
  ];

  // Languages configuration
  const languages = [
    { id: 63, name: 'JavaScript', extension: 'js' },
    { id: 71, name: 'Python', extension: 'py' },
    { id: 54, name: 'C++', extension: 'cpp' },
    { id: 62, name: 'Java', extension: 'java' },
    { id: 78, name: 'Rust', extension: 'rs' },
  ];



  // State variables
  const {user, loading, fetchUser} = useAuth();
  const [yourStatus, setYourStatus] = useState('coding');
  const [roomId, setRoomId] = useState('');
  const [opponentStatus, setOpponentStatus] = useState('coding');
  const [showProblem, setShowProblem] = useState(true);
  const [matchFound, setMatchFound] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentProblem, setCurrentProblem] = useState(problemStatements[0]);
  const [selectedLanguage, setSelectedLanguage] = useState(languages[0]);
  const [yourCode, setYourCode] = useState('');
  const [opponentCode, setOpponentCode] = useState('');

  const joinedRoom = useRef(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef(null);

  // Generate initial code based on problem and language
  const generateInitialCode = (problem: any, language: any) => {
    const functionName = generateFunctionName(problem.description);

    switch (language.name) {
      case 'JavaScript':
        return `function ${functionName}(arr) {
  // Implement your solution here
  return null;
}

console.log(${functionName}([-2, 1, -3, 4, -1, 2, 1, -5, 4]));`;

      case 'Python':
        return `def ${functionName.toLowerCase()}(arr):
    # Implement your solution here
    return None

print(${functionName.toLowerCase()}([-2, 1, -3, 4, -1, 2, 1, -5, 4]))`;

      case 'C++':
        return `#include <iostream>
#include <vector>

using namespace std;

vector<int> ${functionName}(vector<int>& nums) {
    // Implement your solution here
    return {};
}

int main() {
    vector<int> nums = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
    auto result = ${functionName}(nums);
    
    // Print result
    return 0;
}`;

      case 'Java':
        return `import java.util.*;

public class Solution {
    public static int[] ${functionName}(int[] nums) {
        // Implement your solution here
        return null;
    }
    
    public static void main(String[] args) {
        int[] nums = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
        int[] result = ${functionName}(nums);
        // Print result
    }
}`;

      case 'Rust':
        return `fn ${functionName.toLowerCase()}(nums: &[i32]) -> Vec<i32> {
    // Implement your solution here
    vec![]
}

fn main() {
    let nums = vec![-2, 1, -3, 4, -1, 2, 1, -5, 4];
    let result = ${functionName.toLowerCase()}(&nums);
    println!("{:?}", result);
}`;

      default:
        return `// Implement your solution here`;
    }
  };

  // Utility to generate function name from problem statement
  const generateFunctionName = (problem: any) => {
    const keywords = problem
      .match(/\b(array|sum|subarray|maximum|find|largest|optimization|contiguous|two|target)\b/gi) || [];

    const functionName = keywords
      .map((word: string, index: number) =>
        index === 0
          ? word.toLowerCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join('');

    return functionName || 'customSolution';
  };

  // Initialize code when problem or language changes
  useEffect(() => {
    const newCode = generateInitialCode(currentProblem, selectedLanguage);
    setYourCode(newCode);
  }, [currentProblem, selectedLanguage]);

  // Socket connection and event handling
  useEffect(() => {

    async function handlePlayer() {

      if(user !== null) {
        if (!socketRef.current) {
            socketRef.current = io(process.env.DOMAIN_URL || "http://localhost:4000", {
            withCredentials: true
            });
    
          const handleOpponentCode = ({ code, from }: any) => {
            if (socketRef.current && from === socketRef.current.id) {
              setYourCode(code); // It's your code
            } else {
              setOpponentCode(code); // It's opponent's code
            }
          };
    
          const handleConnect = () => {
            socketRef.current?.emit('findMatch', { userId: user.id, eloRating: 100 });
    
            socketRef.current?.on("matchFound", () => {
              setMatchFound(true);
    
              socketRef.current?.emit('joinRoom', user.username);
    
              socketRef.current?.on('roomAssigned', ({ roomId }) => {
                console.log('Assigned to room:', roomId);
                setRoomId(roomId);
              });
    
              socketRef.current?.on('opponentCode', handleOpponentCode);
            });
    
    
          }
    
    
          socketRef.current.connect();
    
          socketRef.current.on("connect", handleConnect)
    
          socketRef.current.on("gameOver", (data) => {
            alert(`${data.message}`);
          })
    
          socketRef.current.on("disconnect", () => {
            console.log("User Disconnected");
          });
    
          
          
          return () => {
            if (socketRef.current) {
              socketRef.current.off("connect");
              socketRef.current.off("disconnect");
              socketRef.current.disconnect();
              socketRef.current = null;
            }
          };
        }
      }
    }
    handlePlayer();
   
  }, [user]);

  
  // Timer setup

  // Send code updates to opponent
  const handleCodeChange = (newCode: string) => {
    setYourCode(newCode || "");
    socketRef.current?.emit('codeUpdate', { roomId: roomId, code: newCode });
  };

  // Send chat message
  const sendMessage = () => {
    if (newMessage.trim()) {
      const message = {
        text: newMessage,
        roomId: roomId,
        timestamp: new Date().toISOString()
      };

      // socket.emit('sendMessage', message);
      // setMessages(prev => [
      //   ...prev,
      //   { text: newMessage, isFromYou: true, timestamp: message.timestamp }
      // ]);
      setNewMessage('');
    }
  };

  // Handle problem selection change
  const handleProblemChange = (problemId: string) => {
    const problem = problemStatements.find(p => p.id === problemId);
    if (problem) {
      setCurrentProblem(problem);
    }
  };

  // Handle language selection change
  const handleLanguageChange = (languageId: string) => {
    const language = languages.find(l => l.id.toString() === languageId);
    if (language) {
      setSelectedLanguage(language);
    }
  };

  // Format time from seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get status styling
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted': return 'text-yellow-500';
      case 'passed': return 'text-green-500';
      case 'failed': return 'text-red-500';
      default: return 'text-blue-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'passed': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <X className="w-4 h-4 text-red-500" />;
      default: return <Code className="w-4 h-4 text-blue-500" />;
    }
  };

  // Format chat timestamp
  const formatMessageTime = (timestamp: Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 py-4 px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            <h1 className="text-xl font-bold text-white">Code Battle Arena</h1>
            <span className="text-slate-400 text-sm">Room: {roomId || 'Connecting...'}</span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-4">
              {/* Problem selection */}
              <Select onValueChange={handleProblemChange} defaultValue={currentProblem.id}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select problem" />
                </SelectTrigger>
                <SelectContent>
                  {problemStatements.map(problem => (
                    <SelectItem key={problem.id} value={problem.id}>
                      {problem.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Language selection */}
              <Select onValueChange={handleLanguageChange} defaultValue={selectedLanguage.id.toString()}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map(language => (
                    <SelectItem key={language.id} value={language.id.toString()}>
                      {language.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* <div className="flex items-center space-x-2">
              <Clock className="w-5 h-5 text-slate-400" />
              <span className="text-xl font-mono font-bold text-white">{formatTime(timeLeft)}</span>
            </div> */}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowProblem(!showProblem)}
            >
              {showProblem ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showProblem ? "Hide Problem" : "Show Problem"}
            </Button>

            <Dialog open={chatOpen} onOpenChange={setChatOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <MessageCircle className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Chat with Opponent</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col h-[300px]">
                  <ScrollArea className="flex-1 p-4">
                    {messages.length === 0 ? (
                      <div className="text-center text-slate-500 mt-10">
                        No messages yet. Start the conversation!
                      </div>
                    ) : (
                      messages.map((msg, index) => (
                        <div
                          key={index}
                          className={`mb-2`}
                        >
                          <div
                            className={`inline-block p-2 rounded-lg 'bg-blue-600 text-white'
                              : 'bg-slate-700 text-slate-200'
                              }`}
                          >
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </ScrollArea>
                  <div className="flex border-t border-slate-700 p-2">
                    <Input
                      value={newMessage}
                      onChange={e => setNewMessage(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 mr-2"
                      onKeyDown={e => e.key === 'Enter' && sendMessage()}
                    />
                    <Button onClick={sendMessage} size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>
      {!matchFound ? (
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
          <p className="text-white mt-4">Searching for a match...</p>
          {/* <p className="text-slate-400 mt-2 italic">{tip}</p> */}
        </div>
      ) : (
        <div className="text-white">
          {/* Main Content */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Problem Statement Section */}
            {showProblem && (
              <div className="w-full md:w-1/4 p-4 border-r border-slate-800 bg-slate-900 overflow-y-auto">
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white">Problem: {currentProblem.title}</CardTitle>
                    <CardDescription>Difficulty: {currentProblem.difficulty}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-slate-300 whitespace-pre-line">
                    {currentProblem.description}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Main Coding Area */}
            <div className={`flex-1 flex flex-col ${showProblem ? 'md:w-2/3' : 'w-full'}`}>
              <Tabs defaultValue="split" className="flex-1 flex flex-col h-screen">
                <div className="bg-slate-900 border-b border-slate-800 px-6 py-2">
                  <TabsList className="bg-slate-800">
                    <TabsTrigger value="split">Split View</TabsTrigger>
                    <TabsTrigger value="you">Your Code</TabsTrigger>
                    <TabsTrigger value="opponent">Opponent's Code</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="split" className="flex-1 flex flex-col md:flex-row m-0 border-0 outline-none">
                  {/* Your Code Editor */}
                  <div className="flex-1 border-r border-slate-800 flex flex-col">
                    <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="bg-blue-950 text-blue-400 border-blue-700">You</Badge>
                        <div className="flex items-center">
                          {getStatusIcon(yourStatus)}
                          <span className={`ml-1 text-sm ${getStatusColor(yourStatus)}`}>
                            {yourStatus.charAt(0).toUpperCase() + yourStatus.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-950 p-0 font-mono text-sm text-slate-300 overflow-auto">
                      <Editor
                        height="100%"
                        language={"javascript"}
                        theme="vs-dark"
                        value={yourCode}
                        options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
                      />
                    </div>
                  </div>

                  {/* Opponent's Code View */}
                  <div className="flex-1 flex flex-col">
                    <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="bg-purple-950 text-purple-400 border-purple-700">Opponent</Badge>
                        <div className="flex items-center">
                          {getStatusIcon(opponentStatus)}
                          <span className={`ml-1 text-sm ${getStatusColor(opponentStatus)}`}>
                            {opponentStatus.charAt(0).toUpperCase() + opponentStatus.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-950 p-4 font-mono text-sm text-slate-300 overflow-auto">
                      <pre className="whitespace-pre">
                        {opponentCode || "Opponent hasn't started coding yet..."}
                      </pre>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="you" className="flex-1 m-0 border-0 outline-none">
                  {/* Full screen Your Code */}
                  <div className="flex-1 flex flex-col h-full">
                    <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="bg-blue-950 text-blue-400 border-blue-700">You</Badge>
                        <div className="flex items-center">
                          {getStatusIcon(yourStatus)}
                          <span className={`ml-1 text-sm ${getStatusColor(yourStatus)}`}>
                            {yourStatus.charAt(0).toUpperCase() + yourStatus.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-950 p-0 font-mono text-sm text-slate-300 overflow-auto">
                      <Editor
                        height="100%"
                        language={selectedLanguage.extension}
                        theme="vs-dark"
                        value={yourCode}
                        options={{ minimap: { enabled: false }, scrollBeyondLastLine: false }}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="opponent" className="flex-1 m-0 border-0 outline-none">
                  {/* Full screen Opponent's Code */}
                  <div className="flex-1 flex flex-col h-full">
                    <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="bg-purple-950 text-purple-400 border-purple-700">Opponent</Badge>
                        <div className="flex items-center">
                          {getStatusIcon(opponentStatus)}
                          <span className={`ml-1 text-sm ${getStatusColor(opponentStatus)}`}>
                            {opponentStatus.charAt(0).toUpperCase() + opponentStatus.slice(1)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 bg-slate-950 p-4 font-mono text-sm text-slate-300 overflow-auto">
                      <pre className="whitespace-pre">
                        {opponentCode || "Opponent hasn't started coding yet..."}
                      </pre>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Results Panel */}
              <div className="bg-slate-900 border-t border-slate-800 p-4">
                <div className="grid grid-cols-1 gap-4">
                  <CodeExecutor sourceCode={yourCode} languageId={selectedLanguage.id} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* <CountdownOverlay
        isVisible={true}
        onComplete={() => {}}
      /> */}

      {/* <GameWinOverlay
        isVisible={true}
        onComplete={() => {}}
        finalScore={54}
      /> */}

    </div>
  );
};

export default CodeBattleArena;
