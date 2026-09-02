import path, { resolve } from "path";
import { fromBuffer } from "file-type";
import isSvg from "is-svg";
import md5 from "crypto-js/md5";
const fs2 = require('fs').promises;
import fs from "fs";
 
 
import {
  FORBIDDEN_SYMBOLS_FILENAME_PATTERN,
  MD_LINK,
  USER_AGENT,
  NOTICE_TIMEOUT,
  APP_TITLE,
  VERBOSE,
  ATT_SIZE_ACHOR
} from "./config";

import {
  requestUrl,
  Notice,
  TFile
} from "obsidian";
 

//import { TIMEOUT } from "dns";
//import fs from "fs";


/*
https://stackoverflow.com/a/48032528/1020973
It will be better to do it type-correct.
*/


export async function showBalloon(str: string, show: boolean = true, timeout = NOTICE_TIMEOUT) {
  if (show) {
    new Notice(APP_TITLE + "\r\n" + str, timeout);
  };
}


export function displayError(error: Error | string, file?: TFile): void {
  if (file) {
    showBalloon(`LocalImagesPlus: Error while handling file ${file.name}, ${error.toString()}`);
  } else {
    showBalloon(error.toString());
  }

  logError(`LocalImagesPlus: error: ${error}`, false);
}

export async function logError(str: any, isObj: boolean = false) {

  if (VERBOSE) {

    console.log(APP_TITLE + ":  ");

    if (isObj) {
      console.table(str);
    }
    else {
      console.log(str);
    }
  }
};

export function md5Sig(contentData: ArrayBuffer = undefined) {

  try {

    var dec = new TextDecoder("utf-8");
    const arrMid = Math.round(contentData.byteLength / 2);
    const chunk = 15000;
    const signature = md5([
      contentData.slice(0, chunk),
      contentData.slice(arrMid, arrMid + chunk),
      contentData.slice(-chunk)
    ].map(x => dec.decode(x)).join()
    ).toString();
 
    return signature + "_MD5";
  }
  catch (e) {

    logError("Cannot generate md5: " + e, false);
    return null;
  }

}


/*
Web clippers (Obsidian Web Clipper among them) usually wrap a picture into a link
pointing to the very same picture:  [![alt](src)](href)
MD_SEARCH_PATTERN only matches the inner "![alt](src)" part, so replacing it in place
leaves "[![[attachment.png]]](href)" behind. Obsidian cannot parse that: the first "]"
of the wiki embed closes the label of the outer link and the whole line degrades to
plain text. There is no valid way to put a wiki embed inside a markdown link, hence the
wrapping link is dropped together with the tag it wraps. Markdown style replacements are
left alone, "[![alt](path)](href)" is perfectly valid.
*/
function wrappingLinkRange(str: string, start: number, end: number) {

  if (str[start - 1] !== "[" || str[start - 2] === "!" ||
    str[end] !== "]" || str[end + 1] !== "(") {
    return null;
  }

  let depth = 1;

  for (let i = end + 2; i < str.length; i++) {
    if (str[i] === "\n") { break; }
    if (str[i] === "(") { depth++; }
    else if (str[i] === ")") {
      depth--;
      if (depth === 0) { return [start - 1, i + 1]; }
    }
  }

  return null;
}


export function replaceImageTag(str: string, oldTag: string, newTag: string) {

  if (!oldTag) { return str; }

  // markdown style links keep the wrapper, "[![alt](path)](href)" renders just fine
  const dropWrapper = newTag.startsWith("![[");

  let result = "";
  let pos = 0;
  let found = str.indexOf(oldTag);

  while (found !== -1) {
    const end = found + oldTag.length;
    const wrapper = dropWrapper ? wrappingLinkRange(str, found, end) : null;

    result += str.slice(pos, wrapper !== null ? wrapper[0] : found) + newTag;
    pos = wrapper !== null ? wrapper[1] : end;
    found = str.indexOf(oldTag, pos);
  }

  return result + str.slice(pos);
}


export async function replaceAsync(str: any, regex: Array<RegExp>, asyncFn: any) {

  logError("replaceAsync: \r\nstr: " + str + "\r\nregex: ")
  logError(regex, true);

  let errorflag = false;
  const promises: Promise<any>[] = [];
  let dictPatt: Array<any>[] = [];
  let link;
  let anchor;
  let replp: any;
  let caption = "";
  let filesArr: Array<string> = [];
  let AttSize = "";

  regex.forEach((element) => {
    logError("cur regex:  " + element);
    const matches = str.matchAll(element);

    for (const match of matches) {
      logError("match: " + match)
    
      anchor = trimAny(match.groups.anchor, [")", "(", "]", "[", " "]); 
      
      // the size belongs to this tag only, otherwise it leaks into the tags that follow
      AttSize = "";
      const AttSizeMatch = anchor.matchAll(ATT_SIZE_ACHOR);
       
      for (const match of AttSizeMatch) {
 
         AttSize = (match.groups.attsize !== undefined) ?  trimAny(match.groups.attsize, [")", "(", "]", "[", " "] ): 
                   (match.groups.attsize2 !== undefined) ?  trimAny(match.groups.attsize2, [")", "(", "]", "[", " "] ): 
         ""; 
        }
         

      link = (match.groups.link.match(MD_LINK) ?? [match.groups.link])[0];
      caption = trimAny((match.groups.link.match(MD_LINK) !== null ?
        (match.groups.link.split(link).length > 1 ?
          match.groups.link.split(link)[1] : "") :
        ""), [")", "]", "(", "[", " "]);
      link = trimAny(link, [")", "(", "]", "[", " "]);
      replp = trimAny(match[0], ["[", "(", "]"]);

      logError(
        "repl: " + replp +
        "\r\nahc: " + anchor +
        "\r\nlink: " + link +
        "\r\ncaption: " + caption + 
        "\r\nAttSize: " + AttSize);

      dictPatt[replp] = [anchor, link, caption, AttSize];

    };

  })

  for (var key in dictPatt) {
    const promise = asyncFn(key, dictPatt[key][0], dictPatt[key][1], dictPatt[key][2], dictPatt[key][3]);
    logError(promise, true);
    promises.push(promise);
  }

  const data = await Promise.all(promises);
  logError("Promises: ");
  logError(data, true);
  //  return str.replace((reg: RegExp, str: String) => { 

  data.forEach((element) => {

    if (element !== null) {

      logError("el: " + element[0] + "  el2: " + element[1] + element[2]);
      str = replaceImageTag(str, element[0], element[1] + element[2]);
      filesArr.push(element[1]);
    }
    else {
      errorflag = true;
    }

  });

  return [str, errorflag, filesArr];

  //  return str.replace( () => data.shift());
}

export function isUrl(link: string) {
  logError("IsUrl: " + link, false);
  try {
    return Boolean(new URL(link));
  } catch (_) {
    return false;
  }
}






export async function copyFromDisk(src: string, dest: string): Promise<null> {
  logError("copyFromDisk: " + src + " to " + dest, false);
  try {
    await fs.copyFile(src, dest, null, (err: Error) => {
      if (err) {
        logError("Error:" + err, false);
      }

    });
  }
  catch (e) {
    logError("Cannot copy: " + e, false);
    return null;
  }
}


 

export async function base64ToBuff(data: string): Promise<ArrayBuffer> {
  logError("base64ToBuff: \r\n", false);
  try {
    const BufferData = Buffer.from(data.split("base64,")[1], 'base64');
    logError(BufferData);
    return BufferData;
  }
  catch (e) {

    logError("Cannot read base64: " + e, false);
    return null;
  }
}

export async function readFromDiskB(file: string, count: number = undefined): Promise<Buffer> {

  try {
    const buffer = Buffer.alloc(count);
    const fd: number = fs.openSync(file, "r+")
    fs.readSync(fd, buffer, 0, buffer.length, 0)
    logError(buffer)
    fs.closeSync(fd)
    return buffer

  } catch (e) {
    logError("Cannot read the file: " + e, false);
    return null
  }



}


export async function readFromDisk(file: string): Promise<ArrayBuffer> {
  logError("readFromDisk: " + file, false);

  try {
    const data = await fs2.readFile(file, null);
    return Buffer.from(data);
  }
  catch (e) {

    logError("Cannot read the file: " + e, false);
    return null;
  }
}

export async function downloadImage(url: string): Promise<ArrayBuffer> {

  logError("Downloading: " + url, false);
  const headers = {
    'method': 'GET',
    'User-Agent': USER_AGENT
  }

  try {
    const res = await requestUrl({ url: url, headers })
    logError(res, true);
    return res.arrayBuffer;
  }
  catch (e) {
    logError("Cannot download the file: " + e, false);
    return null;
  }
}

export async function getFileExt(content: ArrayBuffer, link: string) {

  const fileExtByLink = path.extname(link).replace("\.", "");
  const fileExtByBuffer = (await fromBuffer(content))?.ext;

  // if XML, probably it is SVG
  if (fileExtByBuffer == "xml" || !fileExtByBuffer) {
    const buffer = Buffer.from(content);
    if (isSvg(buffer)) return "svg";
  }


  logError("fileExtByBuffer"+fileExtByBuffer)

  if (fileExtByBuffer != undefined && fileExtByBuffer && fileExtByBuffer.length <= 5 && fileExtByBuffer?.length > 0) {
    return fileExtByBuffer;
  }

  logError("fileExtByLink  " +fileExtByLink)
  
  if (fileExtByLink != undefined  && fileExtByLink.length <= 5 && fileExtByLink?.length > 0) {
    return fileExtByLink;
  }

  return "unknown";
}


//https://stackoverflow.com/questions/26156292/trim-specific-character-from-a-string

export function trimAny(str: string, chars: Array<string>) {
  var start = 0,
    end = str.length;

  while (start < end && chars.indexOf(str[start]) >= 0)
    ++start;

  while (end > start && chars.indexOf(str[end - 1]) >= 0)
    --end;

  return (start > 0 || end < str.length) ? str.substring(start, end) : str;
}


export function cFileName(name: string, sep:string = " ") {
  const cleanedName = name.replace(
    /(\)|\(|\"|\'|\#|\]|\[|\:|\>|\<|\*|\|)/g,
    sep
  );
  return cleanedName;
}
 
export function pathJoin(parts: Array<string>): string {
  const result = path.join(...parts);
  // it seems that obsidian do not understand paths with backslashes in Windows, so turn them into forward slashes
  return result.replace(/\\/g, "/");
}

export function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

export function encObsURI(e: string) {
  return e.replace(/[\\\x00\x08\x0B\x0C\x0E-\x1F ]/g, (function (e) {
    return encodeURIComponent(e)
  }
  ))
}




/**
 * https://github.com/mnaoumov/obsidian-dev-utils (modified)
 * @param blob - The Blob object to convert.
 * @param imgQuality - The quality of the image (0 to 1).
 * @returns A promise that resolves to an ArrayBuffer.
 */
export async function blobToJpegArrayBuffer(blob: Blob, imgQuality: number, imgType: string = "image/jpeg" ): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = (): void => {
      const image = new Image();
      image.onload = (): void => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not get 2D context.');
        }
        const imageWidth = image.width;
        const imageHeight = image.height;
        let data = '';

        canvas.width = imageWidth;
        canvas.height = imageHeight;

        context.fillStyle = '#fff';
        context.fillRect(0, 0, imageWidth, imageHeight);
        context.save();

        context.translate(imageWidth / 2, imageHeight / 2);
        context.drawImage(image, 0, 0, imageWidth, imageHeight, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
        context.restore();

        data = canvas.toDataURL(imgType, imgQuality);

        const arrayBuffer =  base64ToBuff(data);
        resolve(arrayBuffer);
      };

      image.src = reader.result as string;
    };
    reader.readAsDataURL(blob);
  });
}

 