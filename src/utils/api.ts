export const handleApiError = (res: Response, setError: (msg: string | null) => void) => {
  if (res.status === 429) {
    setError('You are sending requests too quickly. Please wait a moment.');
    return true;
  }
  if (res.status === 409) {
    setError('This action is currently being processed. Please try again in a moment.');
    return true;
  }
  return false;
};
