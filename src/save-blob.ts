function saveUrl(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
}

const useObjectUrl =
  // https://crbug.com/733304
  !/ Android 7\..* Chrome\/5\d\./.test(window.navigator.userAgent);

const saveBlob: (blob: Blob, filename: string) => void = useObjectUrl
  ? (blob, filename) => {
      const url = URL.createObjectURL(blob);
      saveUrl(url, filename);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
    }
  : (blob, filename) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        saveUrl(reader.result as string, filename);
      });
      reader.readAsDataURL(blob);
    };

export default saveBlob;
