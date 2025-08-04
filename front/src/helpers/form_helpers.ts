export const createBlobUrlFromContent = async (filePath: string, type: string): Promise<string> => {
  const fileData = await window.easyFormContext.readFile(
    filePath
  );

  const binaryData = atob(fileData.content);

  // Convert binary data to a Uint8Array
  const byteArray = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) {
    byteArray[i] = binaryData.charCodeAt(i);
  }

  // Create a Blob from the Uint8Array
  const blob = new Blob([byteArray], { type });

  // Generate a Blob URL
  return URL.createObjectURL(blob);
};

export const previewFile = async (filePath: string) => {
  try {
    await window.easyFormContext.openFile(filePath);
  } catch (error) {
    console.error('Error opening file:', error);
  }
};
