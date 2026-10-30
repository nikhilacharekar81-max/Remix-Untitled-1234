import { useState } from 'react';

/**
 * Hook responsible for managing workstream meeting / video call integration state.
 */
export function useWorkstreamMeeting(props: any) {
  const [isVideoCallModalOpen, setIsVideoCallModalOpen] = useState(false);

  const handleStartMeeting = () => {
    setIsVideoCallModalOpen(true);
  };

  const handleEndMeeting = () => {
    setIsVideoCallModalOpen(false);
  };

  return {
    isVideoCallModalOpen,
    setIsVideoCallModalOpen,
    handleStartMeeting,
    handleEndMeeting
  };
}
