package fluentbit

import (
	"context"
	"errors"
	"fmt"
	"io/ioutil"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	errDescription = "Validation of the supplied configuration failed with the following reason: "
	// From https://github.com/acarl005/stripansi/blob/master/stripansi.go#L7
	ansiColorsRegex = "[\u001B\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[a-zA-Z\\d]*)*)?\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PRZcf-ntqry=><~]))"
)

//go:generate mockery --name ConfigValidator --filename config_validator.go
type ConfigValidator interface {
	RunCmd(ctx context.Context, name string, args ...string) (string, error)
	Validate(ctx context.Context, configFilePath string) error
}

type configValidator struct {
	FluentBitPath   string
	PluginDirectory string
}

func NewConfigValidator(fluentBitPath string, pluginDirectory string) ConfigValidator {
	return &configValidator{
		FluentBitPath:   fluentBitPath,
		PluginDirectory: pluginDirectory,
	}
}

func (v *configValidator) RunCmd(ctx context.Context, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)

	outBytes, err := cmd.CombinedOutput()
	out := string(outBytes)
	return out, err
}

func (v *configValidator) Validate(ctx context.Context, configFilePath string) error {
	fluentBitArgs := []string{"--dry-run", "--quiet", "--config", configFilePath}
	plugins, err := listPlugins(v.PluginDirectory)
	if err != nil {
		return err
	}
	for _, plugin := range plugins {
		fluentBitArgs = append(fluentBitArgs, "-e", plugin)
	}

	out, err := v.RunCmd(ctx, v.FluentBitPath, fluentBitArgs...)
	if err != nil {
		if strings.Contains(out, "Error") {
			return errors.New(errDescription + extractError(out))
		}
		return fmt.Errorf("Error while validating Fluent Bit config: %v", err)
	}

	return nil
}

func listPlugins(pluginPath string) ([]string, error) {
	var plugins []string
	files, err := ioutil.ReadDir(pluginPath)
	if err != nil {
		return nil, err
	}
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		plugins = append(plugins, filepath.Join(pluginPath, f.Name()))
	}
	return plugins, err
}

// extractError extracts the error message from the output of fluent-bit
// Thereby, it supports the following error patterns:
// 1. Error <msg>\nError: Configuration file contains errors. Aborting
// 2. Error: <msg>. Aborting
// 3. [<time>] [  Error] File <filename>\n[<time>] [  Error] Error in line 4: <msg> Error: Configuration file contains errors. Aborting
func extractError(output string) string {
	rColors := regexp.MustCompile(ansiColorsRegex)
	output = rColors.ReplaceAllString(output, "")

	r1 := regexp.MustCompile(`(?P<description>Error[^\]].+)\n(?P<label>Error:.+)`)
	if r1Matches := r1.FindStringSubmatch(output); r1Matches != nil {
		return r1Matches[1] // 0: complete output, 1: description, 2: label
	}

	r2 := regexp.MustCompile(`.*(?P<label>Error:\s)(?P<description>.+\.)`)
	if r2Matches := r2.FindStringSubmatch(output); r2Matches != nil {
		return r2Matches[2] // 0: complete output, 1: label, 2: description
	}

	r3 := regexp.MustCompile(`Error\s.+`)
	return r3.FindString(output)
}