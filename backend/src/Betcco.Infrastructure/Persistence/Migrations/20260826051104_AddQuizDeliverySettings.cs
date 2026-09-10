using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Betcco.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddQuizDeliverySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AllowLateAttempts",
                table: "Quizzes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvailableFromUtc",
                table: "Quizzes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvailableUntilUtc",
                table: "Quizzes",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RandomizeAnswers",
                table: "Quizzes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "RandomizeQuestions",
                table: "Quizzes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ShowAnswers",
                table: "Quizzes",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "ShowScore",
                table: "Quizzes",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "TimeLimitMinutes",
                table: "Quizzes",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartedAtUtc",
                table: "QuizAttempts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "WasLate",
                table: "QuizAttempts",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AllowLateAttempts",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "AvailableFromUtc",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "AvailableUntilUtc",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "RandomizeAnswers",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "RandomizeQuestions",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "ShowAnswers",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "ShowScore",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "TimeLimitMinutes",
                table: "Quizzes");

            migrationBuilder.DropColumn(
                name: "StartedAtUtc",
                table: "QuizAttempts");

            migrationBuilder.DropColumn(
                name: "WasLate",
                table: "QuizAttempts");
        }
    }
}
