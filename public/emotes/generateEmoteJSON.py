# Description: scan emotes in all sub folders of current folder


import os
import time



emoteJsonFileName = "emotes.json"
emoteJsonBackupFileName = "emotes_bak.json"
indentationStyle = "  " # Two spaces per indentation level


def main():
    # Required global variables
    global emoteJsonFile, emoteJsonBackupFileName, indentationStyle
    
    # We always backup previous file to avoid data loss
    if os.path.isfile(emoteJsonFileName):
        # If the backup file already exists, add current timestamp to it
        if os.path.isfile(emoteJsonBackupFileName):
            os.rename(emoteJsonBackupFileName, os.path.splitext(emoteJsonBackupFileName)[0] + str(int(time.time())) + os.path.splitext(emoteJsonBackupFileName)[1])
            
        os.rename(emoteJsonFileName, emoteJsonBackupFileName)
        
    # Create new JSON file for emotes
    emoteJsonFile = open(emoteJsonFileName, "w+")
    
    # Write the first static line of the JSON file
    emoteJsonFile.write("{\n" + indentationStyle + "\"paths\": {")
    
    # Get all top level directories and put them in the settings JSON object
    topLevelDirectories = os.walk('.').next()[1]
    for dir in topLevelDirectories:
        emoteJsonFile.write("\n" + indentationStyle + indentationStyle + "\"" + dir + "\": \"/emotes/" + dir + "/\"")
        
        # Don't write last comma
        if dir != topLevelDirectories[len(topLevelDirectories) - 1]:
            emoteJsonFile.write(",")
        else:
            emoteJsonFile.write("\n" + indentationStyle + "},\n" + indentationStyle + "\"emotes\": {")
    
    # Now go through the top level directories and write all the file names as JSON
    jsonString = ""
    for dir in topLevelDirectories:
        for (dirPath, dirNames, fileNames) in os.walk(dir):
            for fileName in sorted(fileNames):
                jsonString += "\n" + indentationStyle + indentationStyle + "\"" + os.path.splitext(fileName)[0] + "\": {\n"
                jsonString += indentationStyle + indentationStyle + indentationStyle + "\"image\": \"" + fileName + "\",\n"
                jsonString += indentationStyle + indentationStyle + indentationStyle + "\"type\": \"" + dir + "\"\n" + indentationStyle + indentationStyle + "},"
            break
        
        
    jsonString = jsonString[:-1] # Remove last comma
    emoteJsonFile.write(jsonString)
    
    # Write the final termating JSON characters
    emoteJsonFile.write("\n" + indentationStyle + "}\n" + "}")

if __name__ == "__main__":
    main()
