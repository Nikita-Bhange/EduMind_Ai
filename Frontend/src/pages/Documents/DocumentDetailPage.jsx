import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import documentService from '../../services/documentService';
import Spinner from '../../components/common/Spinner';
import toast from 'react-hot-toast';
import ChatInterface from '../../components/chat/ChatInterface';
import FlashcardManager from '../../components/flashcards/FlashcardManager';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Tabs from '../../components/common/Tabs';
import AIActions from '../../components/ai/AIActions';
import QuizManager from '../../components/quizzes/QuizManager';

const DocumentDetailPage = () => {
  const { id } = useParams();
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Content');

                useEffect(() => {
                  const fetchDocumentDetails = async () => {
                    try {
                      const data = await documentService.getDocumentById(id);
                      setDocument(data);
                    } catch (error) {
                      toast.error('Failed to fetch document details.');
                      console.error(error);
                    } finally {
                      setLoading(false);
                    }
                  };

                  fetchDocumentDetails();
                }, [id]);
              

              // Helper function to get the full PDF URL
              const getPdfUrl = () => {
  if (!document?.data?.filePath) return null;

  const filePath = document.data.filePath;
  const baseUrl = "https://edumind-ai-agm0.onrender.com";

  // Strip any hardcoded origin (localhost or old URL) and keep only the path
  try {
    const url = new URL(filePath);
    return `${baseUrl}${url.pathname}`;
  } catch {
    // filePath is already a relative path like /uploads/file.pdf
    return `${baseUrl}${filePath.startsWith('/') ? '' : '/'}${filePath}`;
  }
};



              const renderContent = () => {
                if (loading) {
                  return <Spinner />;
                }

                if (!document || !document.data || !document.data.filePath) {
                  return <div className="text-slate-700 dark:text-slate-300">PDF not available.</div>;
                }

                  const pdfUrl = getPdfUrl();
                return (
                
                <div  className="bg-white dark:bg-[#151515] border border-gray-300 dark:border-[#2f2f2f] rounded-lg overflow-hidden shadow-sm dark:shadow-[#7A00FF]/10">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#1c1c1c] border-b border-gray-300 dark:border-[#2f2f2f]">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-200">Document Viewer</span>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 dark:text-[#ff8bcb] dark:hover:text-[#ffb3dc]"
                  >
                    <ExternalLink size={16} />
                    Open in new tab
                  </a>
                </div>

                <div className="bg-gray-100 dark:bg-[#101010] p-1">
                  <iframe
                    src={pdfUrl}
                    className="w-full h-[70vh] bg-white rounded"
                    title="PDF Viewer"
                
                    style={{
                      colorScheme: 'light',
                    }}
                  />
                </div>
              </div>
                
                );
              };

              const renderChat = () => {
                return <ChatInterface/>;
              } 
              const renderAIActions = () => {
                return <AIActions/>;
              };

              const renderFlashcardsTab = () => {
                return <FlashcardManager documentId={id}/>;
              };
              const renderQuizzesTab = () => {
                return <QuizManager documentId={id}/>
              };


            const tabs = [
              { name: 'Content', label: 'Content' },
              { name: 'Chat', label: 'Chat' },
              { name: 'AI Actions', label: 'AI Actions' },
              { name: 'Flashcards', label: 'Flashcards' },
              { name: 'Quizzes', label: 'Quizzes' },
            ];

        if (loading) {
          return <Spinner />;
        }

        if (!document) {
          return <div className="text-center p-8">Document not found.</div>;
        }


        return (
          <div>
            <div className="mb-4">
              <Link to="/documents" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100 mb-4">
                <ArrowLeft size={16} />
                Back to Documents
              </Link>
              {/* subtitle={`Uploaded on ${new Date(document.data.uploadedAt).toLocaleDateString()}`} */}
              <PageHeader className="text-2xl gap-3" title={document.data.title}  />
              <Tabs tabs={tabs} activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            <div className="mt-6">
              {activeTab === 'Content' && renderContent()}
              {activeTab === 'Chat' && renderChat()}
              {activeTab === 'AI Actions' && renderAIActions()}
              {activeTab === 'Flashcards' && renderFlashcardsTab()}
              {activeTab === 'Quizzes' && renderQuizzesTab()}
            </div>
          </div>
        )

      }   
export default DocumentDetailPage







