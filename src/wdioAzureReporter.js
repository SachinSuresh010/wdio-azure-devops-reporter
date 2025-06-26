import WDIOReporter from '@wdio/reporter';
import fs from 'fs';
import path from 'path';
import { AzureDevOpsClient } from './azureDevOpsClient.js';
import helpers from './helpers/index.js';

class WdioAzureReporter extends WDIOReporter {
    constructor(options) {
        super(options);
        this.options = options;
        this.azureClient = new AzureDevOpsClient(options);
        this.testResultsToUpload = [];
        this.reporterStats = {
            numScreenshots: 0
        };
        // this.testRunId = options.testRunId;
        this.testResultMapping = {};
        this.testStepFlag = false;
        this.testStepFailureFlag = false;
        this.durationInMs = 0;
        this.screenshotPath = options.screenshotPath || path.resolve('.artifacts', 'screenshots');
    }

    /**
     * Helper to extract Azure DevOps Test Case ID (numeric part) from a string.
     * @param {string} text - The string to parse (e.g., "C2370 Some test case name").
     * @returns {string | null} The extracted numeric ID (e.g., "2370") or null if not found.
     */
    _extractAzureDevOpsTestCaseId(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }
        const match = text.match(/\bC(\d+)\b/); // Finds 'C' followed by digits, as a whole word
        if (match && match[1]) {
            return match[1];
        }
        return null;
    }

    /**
     * Helper to extract Azure DevOps Test Case ID (numeric part) from a string.
     * @param {string} text - The string to parse (e.g., "C2370 Some test case name").
     * @returns {string | null} The extracted numeric ID (e.g., "2370") or null if not found.
     */
    _extractAzureDevOpsTestStepId(text) {
        if (!text || typeof text !== 'string') return [];
        const matches = [...text.matchAll(/\[S(\d+)\]/g)];
        return matches.map(match => match[1]); // returns array of step IDs
    }

    /**
     * On Test Start
     * @param {object} test Test Object
     */
    async onTestStart(test){
        const fullTestTitle = test.fullTitle;
        const testTitle = test.title;
        const parentSuiteTitle = test.parent;
        let azureTestCaseId = null;
        let azureTestStepId = null;
        const runtimePath = path.join(process.cwd(), 'test-run-meta.json');
        if (fs.existsSync(runtimePath)) {
            const data = JSON.parse(fs.readFileSync(runtimePath, 'utf-8'));
            this.testRunId = data.testRunId;
            this.azureClient.currentTestRunId = this.testRunId
        }
        // Check if the 'it' block's title contains the ID
        azureTestCaseId = this._extractAzureDevOpsTestCaseId(testTitle);
        azureTestStepId = this._extractAzureDevOpsTestStepId(testTitle);
        // Check if the 'describe' title contains the ID
        if (!azureTestCaseId && parentSuiteTitle) {
            azureTestCaseId = this._extractAzureDevOpsTestCaseId(parentSuiteTitle)
        }

        if (azureTestCaseId) {
            const testResultMapping = await this.azureClient.getTestResults(this.testRunId, azureTestCaseId);
            this.testResultMapping = testResultMapping;

            const testResult = {
                id: testResultMapping.testResultId,
                outcome: "InProgress",
                state: "Completed",
                comment: "Test started using Automation.",
                durationInMs: 0
            };

            // Add steps only if step IDs exist
            if (azureTestStepId.length > 0) {
                this.testStepFlag = true;
                testResult.iterationDetails = [{
                    id: 1,
                    outcome: "InProgress",
                    actionResults: azureTestStepId.map(stepId => ({
                        actionPath: helpers.toEightDigitHex(parseInt(stepId)+1),
                        iterationId: 1,
                        stepIdentifier: parseInt(stepId)+1,
                        outcome: "InProgress"
                    }))
                }];
            }
            const existingIndex = this.testResultsToUpload.findIndex(item => item.id === testResult.id);
            if (existingIndex !== -1) {
                // If the id is present, replace the existing item
                this.testResultsToUpload[existingIndex] = testResult;
                console.log(`Updated existing test result with ID: ${testResult.id}`);
            } else {
                this.testResultsToUpload.push(testResult);
            }
            await this.azureClient.updateTestResults(this.testResultsToUpload);
        }
    }

    /**
     * On Test Skip
     * @param {object} test Test object
     * @returns
     */
    async onTestSkip(test) {
        if (!this.azureClient.currentTestRunId) {
            console.log(`Azure DevOps Test Run ID not set. Skipping result upload for skipped test: ${test.fullName}\n`);
            return;
        }

        this.testResultsToUpload.push(
            {
                id: this.testResultMapping.testResultId,
                outcome: "NotApplicable",
                state: "Completed",
                comment: "Test was skipped by Automation.",
                durationInMs: 0
            }
        )
        await this.azureClient.updateTestResults(this.testResultsToUpload)
    }

    /**
     * On Test End
     * @param {object} test Test object
     * @returns
     */
    async onTestEnd(test) {
        if (!this.azureClient.currentTestRunId || !this.testResultMapping.testResultId) {
            console.log(`Azure DevOps Test Run ID not set. Skipping result upload for test: ${test.title}\n`);
            return;
        }

        let overallOutcome = test.state === 'passed' ? 'Passed' : 'Failed';
        let comment = test.state === 'passed' ? 'Test passed.' : `Test failed: ${test.error.message}\nStack: ${test.error.stack}`;
        this.durationInMs += test.duration || 0;

        // Find the existing test result to update
        const existingIndex = this.testResultsToUpload.findIndex(item => item.id === this.testResultMapping.testResultId);

        if (existingIndex !== -1) {
            const testResultToUpdate = this.testResultsToUpload[existingIndex];
            // Conditionally update iterationDetails for test steps first
            if (this.testStepFlag && testResultToUpdate.iterationDetails && testResultToUpdate.iterationDetails.length > 0) {
                const stepOutcome = overallOutcome === 'Passed' ? 'Passed' : 'Failed'; // Initial step outcome
                let stepMessage = overallOutcome === 'Passed' ? '' : comment; // Initial step message
                testResultToUpdate.iterationDetails[0].outcome = stepOutcome; // Default to overall

                testResultToUpdate.iterationDetails[0].actionResults.forEach(action => {
                    action.outcome = stepOutcome;
                    action.errorMessage = stepMessage;

                    if (action.outcome === 'Failed') {
                        this.testStepFailureFlag = true;
                    }
                });

                // Override overallOutcome if any step failed AND testStepFlag is true
                if (this.testStepFailureFlag) {
                    overallOutcome = 'Failed';
                    testResultToUpdate.iterationDetails[0].outcome = 'Failed'; // Ensure iteration outcome also reflects failure
                    // Update the main test comment to reflect step failure
                    comment = `Test failed due to one or more failing steps.`;
                }
            }
            // Update the basic properties with potentially updated overallOutcome
            testResultToUpdate.outcome = overallOutcome;
            testResultToUpdate.state = "Completed";
            testResultToUpdate.comment = comment; // Comment is now potentially updated
            testResultToUpdate.durationInMs = this.durationInMs;

            console.log(`Updated existing test result with ID: ${testResultToUpdate.id}`);
        } else {
            // This case should ideally not happen if onTestStart always adds the result,
            // but included for robustness.
            const newItem = {
                id: this.testResultMapping.testResultId,
                outcome: overallOutcome, // Use potentially updated overallOutcome
                state: "Completed",
                comment: comment, // Use potentially updated comment
                durationInMs: this.durationInMs
            };
            // Add steps if testStepFlag was true during onTestStart
            if (this.testStepFlag) {
                const stepOutcome = overallOutcome === 'Passed' ? 'Passed' : 'Failed';
                const azureTestStepId = this._extractAzureDevOpsTestStepId(test.title); // Re-extract steps if needed
                newItem.iterationDetails = [{
                    id: 1,
                    outcome: stepOutcome,
                    actionResults: azureTestStepId.map(stepId => ({
                        actionPath: helpers.toEightDigitHex(parseInt(stepId) + 1),
                        iterationId: 1,
                        stepIdentifier: parseInt(stepId) + 1,
                        outcome: stepOutcome // Set step outcome based on overall test outcome initially
                    }))
                }];
            }
            this.testResultsToUpload.push(newItem);
            console.log(`Added new test result with ID: ${newItem.id}`);
        }

        await this.azureClient.updateTestResults(this.testResultsToUpload);

        // Screenshot handling (moved from wdio.conf.js)
        if (test.state === 'failed' && typeof browser !== 'undefined' && browser.takeScreenshot) {
            try {
                const screenshot = await browser.takeScreenshot();
                const fileName = `${test.title.replace(/\s+/g, '_')}.png`;
                const filePath = path.resolve(this.screenshotPath, fileName);

                if (!fs.existsSync(path.dirname(filePath))) {
                    fs.mkdirSync(path.dirname(filePath), { recursive: true });
                }

                fs.writeFileSync(filePath, screenshot, 'base64');

                // Attach screenshot to Azure DevOps
                const fileContent = fs.readFileSync(filePath);
                const fileContentBase64 = fileContent.toString('base64');
                await this.azureClient.addAttachment(
                    this.testResultMapping.testResultId,
                    fileName,
                    fileContentBase64,
                    'Failure Screenshot'
                );
            } catch (err) {
                console.error('Failed to capture or attach screenshot:', err);
            }
        }
    }

    /**
     * On Runner End
     * @param {object} runnerStats Runner Stats
     * @returns
     */
    async onRunnerEnd(runnerStats) {
        const hasFailures = runnerStats.failures > 0;
        const outcome = hasFailures ? 'Completed' : 'Completed';
        console.log(`Test run finished. Setting Azure DevOps Test Run to "${outcome}".`);
        return this.azureClient.completeTestRun(outcome)
            .then(() => console.log(`Azure DevOps Test Run set to "${outcome}".`))
            .catch(err => console.error('Error completing Azure DevOps Test Run:', err));
    }
}

export { WdioAzureReporter };
